import { useEffect, useState } from "react";
import { untilLabel, upcoming, waitProgress } from "../../calendar/events";
import { useCalendarStore } from "../../calendar/store";
import { useConfigStore } from "../../config/useConfig";
import { ipc } from "../../lib/ipc";
import { useWeatherStore } from "../../weather/store";
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

/** Próximos eventos do Google Agenda (ou o convite para conectar). */
function Events({ active }: { active: boolean }) {
  const { status, events, error, load } = useCalendarStore();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    void load();
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, [active, load]);

  if (error) {
    return <EmptyState title="Não consegui ler a agenda" text={error} action={{ label: "Tentar de novo", onClick: () => void load(true) }} />;
  }
  if (!status?.connected) {
    return (
      <EmptyState
        title="Conecte o Google Agenda"
        text={status?.configured ? "Falta fazer o login." : "Veja os próximos eventos aqui. Configure em Integrações."}
        action={{ label: "Abrir configurações", onClick: () => ipc.openSettings() }}
      />
    );
  }

  const list = upcoming(events, now).slice(0, 3);
  if (list.length === 0) return <EmptyState title="Agenda livre" text="Nenhum evento nas próximas 36 horas." />;

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

export function AgendaPage({ active }: { active: boolean }) {
  const city = useConfigStore((s) => s.config.weatherCity);
  const unit = useConfigStore((s) => s.config.weatherUnit);
  const { weather, error, loading, load } = useWeatherStore();

  useEffect(() => {
    if (active) void load(city);
  }, [active, city, load]);

  const hot = weather ? Math.max(...weather.hourly, weather.temperature) : 0;
  const cold = weather ? Math.min(...weather.hourly, weather.temperature) : 0;

  return (
    <div className="bento ag">
      <div className="tile wx">
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
              </small>
              <div className="hrs">
                {weather.hourly.map((t, i) => (
                  <i key={i} style={{ height: `${25 + ((t - cold) / Math.max(1, hot - cold)) * 75}%` }} title={degrees(t, unit)} />
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="wx-empty">
            <b>{!city.trim() ? "Defina a cidade" : loading ? "Buscando o clima…" : "Sem clima"}</b>
            <small>{error ?? "Em Configurações, em Integrações."}</small>
            {!city.trim() && (
              <button className="btn sm" onClick={() => ipc.openSettings()}>
                Configurar
              </button>
            )}
          </div>
        )}
        {weather && <span className="wx-city">{weather.city}</span>}
      </div>

      <Events active={active} />
    </div>
  );
}
