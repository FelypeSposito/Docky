import { type ReactNode, useEffect, useState } from "react";
import { groupByDay, timeRange, untilLabel, upcoming, waitProgress } from "../../calendar/events";
import { useCalendarStore } from "../../calendar/store";
import { useConfigStore } from "../../config/useConfig";
import { ipc, type Weather } from "../../lib/ipc";
import { useWeatherStore } from "../../weather/store";
import { rainNote, uvLabel } from "../../weather/summary";
import { EmptyState } from "../EmptyState";
import { WeatherIcon } from "../icons";

const DESCRIPTIONS: [number, string][] = [
  [0, "Céu limpo"],
  [1, "Poucas nuvens"],
  [2, "Parcialmente nublado"],
  [3, "Nublado"],
  [48, "Neblina"],
  [57, "Garoa"],
  [67, "Chuva"],
  [77, "Neve"],
  [82, "Pancadas de chuva"],
  [99, "Tempestade"],
];

const describe = (code: number) => (DESCRIPTIONS.find(([max]) => code <= max) ?? [0, "—"])[1];
const degrees = (value: number, unit: "c" | "f" = "c") => `${Math.round(unit === "f" ? (value * 9) / 5 + 32 : value)}°`;

/** Eventos do Google Agenda: busca ao abrir a página e conta o tempo para os "em 12 min" andarem. */
function useAgenda(active: boolean) {
  const { status, events, error, load } = useCalendarStore();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    void load();
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, [active, load]);

  return { status, events, error, load, now };
}

/** O aviso que substitui a lista quando ela não pode aparecer (erro ou Google ainda não conectado). */
function agendaNotice({ status, error, load }: ReturnType<typeof useAgenda>): ReactNode | null {
  if (error) {
    return <EmptyState title="Não consegui ler a agenda" text={error} action={{ label: "Tentar de novo", onClick: () => void load(true) }} />;
  }
  if (!status?.connected) {
    return (
      <EmptyState
        title="Conecte o Google Agenda"
        text={status?.configured ? "Falta fazer o login." : "Veja os próximos eventos aqui. Configure em Integrações."}
        action={{ label: "Abrir configurações", onClick: () => ipc.openSettings("integracoes") }}
      />
    );
  }
  return null;
}

/** Próximos eventos do Google Agenda (ou o convite para conectar). */
function Events({ active }: { active: boolean }) {
  const agenda = useAgenda(active);
  const notice = agendaNotice(agenda);
  if (notice) return notice;

  const list = upcoming(agenda.events, agenda.now).slice(0, 3);
  if (list.length === 0) return <EmptyState title="Agenda livre" text="Nenhum evento nas próximas 36 horas." />;

  const { now } = agenda;
  const [next, ...rest] = list;
  return (
    <div className="tile cal">
      <div className="cal-next">
        <div className="cal-tx">
          <b title={next.title}>{next.title}</b>
          <span>{untilLabel(next, now)}</span>
          <div className="cd">
            <i style={{ width: `${waitProgress(next, now) * 100}%` }} />
          </div>
        </div>
        {next.meetUrl && (
          <button className="go" onClick={() => void ipc.openUrl(next.meetUrl!)}>
            Entrar
          </button>
        )}
      </div>
      {rest.map((event) => (
        <div className="cal-row" key={event.id}>
          <b title={event.title}>{event.title}</b>
          <span>{untilLabel(event, now)}</span>
        </div>
      ))}
    </div>
  );
}

/** Todos os eventos das próximas 36 horas, agrupados por dia, com horário, local e o botão de entrar na chamada. */
function EventsLarge({ active }: { active: boolean }) {
  const agenda = useAgenda(active);
  const notice = agendaNotice(agenda);
  if (notice) return notice;

  const { now } = agenda;
  const groups = groupByDay(upcoming(agenda.events, now), now);
  if (groups.length === 0) return <EmptyState title="Agenda livre" text="Nenhum evento nas próximas 36 horas." />;

  return (
    <div className="tile calx">
      {groups.map((group) => (
        <section key={group.label}>
          <h3>{group.label}</h3>
          {group.events.map((event) => (
            <div className="calx-row" key={event.id}>
              <time>{timeRange(event)}</time>
              <div className="calx-tx">
                <b title={event.title}>{event.title}</b>
                <span>{[event.allDay ? null : untilLabel(event, now), event.location].filter(Boolean).join(" · ")}</span>
              </div>
              {event.meetUrl && (
                <button className="go" onClick={() => void ipc.openUrl(event.meetUrl!)}>
                  Entrar
                </button>
              )}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

/** O clima do dia: temperatura, descrição, máxima e mínima, chuva e as próximas horas. Na tela maior, mais detalhes. */
function WeatherTile({ active, large = false }: { active: boolean; large?: boolean }) {
  const city = useConfigStore((s) => s.config.weatherCity);
  const unit = useConfigStore((s) => s.config.weatherUnit);
  const { weather, error, loading, load } = useWeatherStore();

  useEffect(() => {
    if (active) void load(city);
  }, [active, city, load]);

  const hot = weather ? Math.max(...weather.hourly, weather.temperature) : 0;
  const cold = weather ? Math.min(...weather.hourly, weather.temperature) : 0;

  return (
    <div className={`tile wx${large ? " wxl" : ""}`}>
      {weather ? (
        <>
          <span className="sun">
            <WeatherIcon code={weather.code} />
          </span>
          <div className="big">{degrees(weather.temperature, unit)}</div>
          <div>
            <small>
              {describe(weather.code)}
              <br />
              Máx {degrees(weather.max, unit)} · Mín {degrees(weather.min, unit)}
              {!large && (
                <>
                  <br />
                  <span className="rain-note">{rainNote(weather)}</span>
                </>
              )}
            </small>
            {!large && (
              <div className="hrs">
                {weather.hourly.map((t, i) => (
                  <i key={i} style={{ height: `${25 + ((t - cold) / Math.max(1, hot - cold)) * 75}%` }} title={degrees(t, unit)} />
                ))}
              </div>
            )}
          </div>
          {large && <WeatherDetails weather={weather} unit={unit} />}
        </>
      ) : (
        <div className="wx-empty">
          <b>{!city.trim() ? "Defina a cidade" : loading ? "Buscando o clima…" : "Sem clima"}</b>
          <small>{error ?? "Em Configurações, em Integrações."}</small>
          {!city.trim() && (
            <button className="btn sm" onClick={() => ipc.openSettings("integracoes")}>
              Configurar
            </button>
          )}
        </div>
      )}
      {weather && <span className="wx-city">{weather.city}</span>}
    </div>
  );
}

/** Os detalhes da tela maior: sensação, umidade, vento, UV, sol e a chance de chuva hora a hora. */
function WeatherDetails({ weather, unit }: { weather: Weather; unit: "c" | "f" }) {
  const facts: [string, string][] = [
    ["Sensação", weather.feelsLike === null ? "—" : degrees(weather.feelsLike, unit)],
    ["Umidade", weather.humidity === null ? "—" : `${Math.round(weather.humidity)}%`],
    ["Vento", weather.windKmh === null ? "—" : `${Math.round(weather.windKmh)} km/h`],
    ["UV máx.", weather.uvMax === null ? "—" : `${Math.round(weather.uvMax)} · ${uvLabel(weather.uvMax)}`],
    ["Nascer do sol", weather.sunrise ?? "—"],
    ["Pôr do sol", weather.sunset ?? "—"],
  ];
  return (
    <>
      <dl className="wx-facts">
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <div className="wx-rain">
        <span className="wx-rain-note">{rainNote(weather)}</span>
        <div className="wx-bars" role="img" aria-label="Chance de chuva nas próximas 12 horas">
          {weather.hours.map((h, i) => (
            <div key={i} className="wx-bar" title={`${h.hour}h · ${Math.round(h.rain)}% de chuva · ${degrees(h.temp, unit)}`}>
              <i style={{ height: `${Math.max(6, h.rain)}%` }} className={h.rain >= 40 ? "wet" : ""} />
              <em>{i % 3 === 0 ? `${h.hour}h` : ""}</em>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

export function AgendaPage({ active }: { active: boolean }) {
  return (
    <div className="bento ag">
      <WeatherTile active={active} />
      <Events active={active} />
    </div>
  );
}

/** A versão maior da Agenda: o clima ao lado e a lista completa de eventos. */
export function AgendaLarge({ active }: { active: boolean }) {
  return (
    <div className="bento ag big">
      <WeatherTile active={active} large />
      <EventsLarge active={active} />
    </div>
  );
}
