import { useEffect } from "react";
import { useConfigStore } from "../../config/useConfig";
import { ipc } from "../../lib/ipc";
import { useWeatherStore } from "../../weather/store";
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
const degrees = (value: number) => `${Math.round(value)}°`;

export function AgendaPage({ active }: { active: boolean }) {
  const city = useConfigStore((s) => s.config.weatherCity);
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
            <div className="big">{degrees(weather.temperature)}</div>
            <div>
              <small>
                {describe(weather.code)}
                <br />
                Máx {degrees(weather.max)} · Mín {degrees(weather.min)}
              </small>
              <div className="hrs">
                {weather.hourly.map((t, i) => (
                  <i key={i} style={{ height: `${25 + ((t - cold) / Math.max(1, hot - cold)) * 75}%` }} title={degrees(t)} />
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="wx-empty">
            <b>{!city.trim() ? "Defina a cidade" : loading ? "Buscando o clima…" : "Sem clima"}</b>
            <small>{error ?? "Em Configurações, em Integrações."}</small>
            {!city.trim() && (
              <button className="btn" onClick={() => ipc.openSettings()}>
                Abrir configurações
              </button>
            )}
          </div>
        )}
        {weather && <span className="wx-city">{weather.city}</span>}
      </div>

      <div className="tile cal-soon">
        <b>Google Calendar</b>
        <span>A conexão com a sua agenda chega numa próxima etapa. Por enquanto, a Agenda mostra o clima.</span>
      </div>
    </div>
  );
}
