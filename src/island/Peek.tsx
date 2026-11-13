import { useEffect, useState } from "react";
import { untilLabel, upcoming } from "../calendar/events";
import { useCalendarStore } from "../calendar/store";
import { useConfigStore } from "../config/useConfig";
import { useFocusStore } from "../focus/store";
import { clock as timerClock, LABELS } from "../focus/timer";
import { ipc } from "../lib/ipc";
import { useMediaStore, usePositionMs } from "../media/store";
import { useWeatherStore } from "../weather/store";
import { CalendarIcon, Equalizer, GridIcon, MusicIcon, NextIcon, NoteIcon, PauseIcon, PlayIcon, PrevIcon, TimerIcon, WeatherIcon } from "./icons";
import { useIslandStore } from "./store";

const mmss = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

const START = { focus: "Iniciar foco", short: "Iniciar pausa", long: "Iniciar pausa longa", custom: "Iniciar contador" } as const;

/** Abre a ilha numa página (e deixa fixada, porque foi um clique). */
const openPage = (page: string) => {
  const island = useIslandStore.getState();
  island.setPage(page);
  island.togglePin();
};

/** O player que aparece ao passar o mouse sobre a pílula com música: capa, nome, a barra do tempo e os controles. */
export function PeekPlayer({ active }: { active: boolean }) {
  const media = useMediaStore((s) => s.media);
  const thumbnail = useMediaStore((s) => s.thumbnail);
  const position = usePositionMs(active);
  if (!media) return null;
  const duration = media.durationMs;
  const progress = duration > 0 ? Math.min(1, position / duration) : 0;
  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div className="pk pk-music">
      <div className="pk-top">
        <span className="pk-song">
          <b>{media.title || "Sem título"}</b>
          {media.artist && <em> · {media.artist}</em>}
        </span>
        <Equalizer playing={media.playing} />
      </div>
      <div className="pk-row">
        {thumbnail ? <img className="pk-cover" src={thumbnail} alt="" /> : <span className="pk-cover empty">
            <MusicIcon size={15} />
          </span>}
        <span className="pk-time">{mmss(position)}</span>
        <span className="pk-bar" aria-hidden="true">
          <i style={{ width: `${progress * 100}%` }} />
        </span>
        <span className="pk-time">{duration > 0 ? mmss(duration) : ""}</span>
        <span className="pk-ctl" onClick={stop}>
          <button aria-label="Música anterior" onClick={() => ipc.mediaControl("previous")}>
            <PrevIcon size={14} />
          </button>
          <button className="main" aria-label={media.playing ? "Pausar" : "Tocar"} onClick={() => ipc.mediaControl("toggle")}>
            {media.playing ? <PauseIcon size={15} /> : <PlayIcon size={15} />}
          </button>
          <button aria-label="Próxima música" onClick={() => ipc.mediaControl("next")}>
            <NextIcon size={14} />
          </button>
        </span>
      </div>
    </div>
  );
}

/**
 * Sem música, passar o mouse mostra um resumo do que importa agora (o próximo compromisso, o clima, o Foco) e
 * atalhos de um clique para a nota rápida e os atalhos. Cada item leva à página certa.
 */
export function PeekGlance({ active, clock, date }: { active: boolean; clock: string; date: string }) {
  const city = useConfigStore((s) => s.config.weatherCity);
  const weather = useWeatherStore((s) => s.weather);
  const loadWeather = useWeatherStore((s) => s.load);
  const events = useCalendarStore((s) => s.events);
  const loadCalendar = useCalendarStore((s) => s.load);
  const timer = useFocusStore();
  const [now, setNow] = useState(() => Date.now());

  // Os dados vêm dos mesmos lugares da Agenda (com cache), só quando o resumo aparece.
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    void loadWeather(city);
    void loadCalendar();
  }, [active, city, loadWeather, loadCalendar]);

  const next = upcoming(events, now).find((e) => !e.allDay && e.startMs - now < 12 * 3_600_000);
  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div className="pk pk-glance">
      <div className="pk-top center">
        <span className="pk-date">{date}</span>
        <b className="time">{clock}</b>
      </div>
      <div className="pk-chips" onClick={stop}>
        {next && (
          <button className="pk-chip wide" onClick={() => openPage("cal")} title={next.title}>
            <CalendarIcon size={14} />
            <span>{next.title}</span>
            <em>{untilLabel(next, now)}</em>
          </button>
        )}
        {weather && (
          <button className="pk-chip" onClick={() => openPage("cal")} title={`${weather.city}: máx ${Math.round(weather.max)}°, mín ${Math.round(weather.min)}°`}>
            <WeatherIcon code={weather.code} size={15} />
            <span>{Math.round(weather.temperature)}°</span>
          </button>
        )}
        <button className={`pk-chip${timer.running ? ` on ${timer.mode}` : ""}`} onClick={() => timer.toggle()} title={timer.running ? "Pausar" : "Começar agora"}>
          <TimerIcon size={14} />
          <span>{timer.running ? `${LABELS[timer.mode]} ${timerClock(timer.left)}` : START[timer.mode]}</span>
        </button>
        <button className="pk-chip" onClick={() => openPage("note")} aria-label="Nota rápida" title="Nota rápida">
          <NoteIcon size={14} />
          {!next && <span>Nota</span>}
        </button>
        <button className="pk-chip" onClick={() => openPage("launch")} aria-label="Atalhos" title="Atalhos">
          <GridIcon size={14} />
          {!next && <span>Atalhos</span>}
        </button>
      </div>
    </div>
  );
}
