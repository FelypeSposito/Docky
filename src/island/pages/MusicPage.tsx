import { useRef, useState } from "react";
import { useConfigStore } from "../../config/useConfig";
import { ipc } from "../../lib/ipc";
import { lineIndexAt } from "../../media/lrc";
import { useMediaStore, usePositionMs } from "../../media/store";
import { LyricsIcon, MusicIcon, NextIcon, PauseIcon, PlayIcon, PrevIcon, VolumeIcon } from "../icons";

const fmt = (ms: number) => {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

const LYRIC_ROW = 24;

export function MusicPage({ active }: { active: boolean }) {
  const media = useMediaStore((s) => s.media);
  const thumbnail = useMediaStore((s) => s.thumbnail);
  const lyrics = useMediaStore((s) => s.lyrics);
  const volume = useMediaStore((s) => s.volume);
  const delay = useConfigStore((s) => s.config.lyricDelayMs);

  const [showLyrics, setShowLyrics] = useState(false);
  const [dragRatio, setDragRatio] = useState<number | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const position = usePositionMs(active && !!media);

  if (!media) {
    return (
      <div className="tile soon">
        <b>Nada tocando agora</b>
        <span>Toque algo no Spotify, no navegador ou em outro player para controlar por aqui.</span>
      </div>
    );
  }

  const duration = media.durationMs;
  const ratio = dragRatio ?? (duration > 0 ? Math.min(1, position / duration) : 0);
  const shownPosition = dragRatio !== null ? dragRatio * duration : position;

  const ratioAt = (event: React.PointerEvent) => {
    const box = trackRef.current!.getBoundingClientRect();
    return Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
  };
  const commitSeek = (value: number) => {
    const positionMs = Math.round(value * duration);
    ipc.mediaSeek(positionMs);
    useMediaStore.getState().setMedia({ ...media, positionMs, thumbnail: null });
    setDragRatio(null);
  };

  const lines = lyrics?.synced ?? null;
  const current = lines ? lineIndexAt(lines, position, delay) : -1;

  const level = volume?.level ?? 0;
  const muted = volume?.muted ?? false;

  return (
    <div className={`mp${showLyrics ? " lyr" : ""}`}>
      <div className="m-top">
        <div className="cover" style={thumbnail ? { backgroundImage: `url(${thumbnail})` } : undefined}>
          {!thumbnail && <MusicIcon size={26} />}
        </div>
        <div className="m-meta">
          <div className="m-title">{media.title}</div>
          <div className="m-artist">{media.artist || media.app}</div>
        </div>
      </div>

      <div className="m-lyrics" aria-hidden={!showLyrics}>
        <div className="ls" style={{ transform: `translateY(${(1 - Math.max(0, current)) * LYRIC_ROW}px)` }}>
          {(lines ?? []).map((line, i) => (
            <div key={i} className={i === current ? "cur" : ""}>
              {line.text || "♪"}
            </div>
          ))}
        </div>
      </div>

      <div className="m-prog">
        <span>{fmt(shownPosition)}</span>
        <div
          ref={trackRef}
          className={`track${dragRatio !== null ? " drag" : ""}`}
          onPointerDown={(e) => {
            if (duration <= 0) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            setDragRatio(ratioAt(e));
          }}
          onPointerMove={(e) => dragRatio !== null && setDragRatio(ratioAt(e))}
          onPointerUp={(e) => dragRatio !== null && commitSeek(ratioAt(e))}
        >
          <b>
            <i style={{ width: `${ratio * 100}%` }} />
          </b>
        </div>
        <span>{duration > 0 ? `-${fmt(duration - shownPosition)}` : "—"}</span>
      </div>

      <div className="m-ctrl">
        <button
          className={`ib${showLyrics ? " on" : ""}`}
          aria-label="Letra"
          disabled={!lines}
          title={lines ? "Mostrar a letra" : "Sem letra sincronizada para esta faixa"}
          onClick={() => setShowLyrics((v) => !v)}
        >
          <LyricsIcon />
        </button>
        <div className="mid">
          <button className="ib big" aria-label="Anterior" onClick={() => ipc.mediaControl("previous")}>
            <PrevIcon />
          </button>
          <button className="ib big" aria-label={media.playing ? "Pausar" : "Tocar"} onClick={() => ipc.mediaControl("toggle")}>
            {media.playing ? <PauseIcon /> : <PlayIcon />}
          </button>
          <button className="ib big" aria-label="Próxima" onClick={() => ipc.mediaControl("next")}>
            <NextIcon />
          </button>
        </div>
        <div className="vol">
          <button
            className="ib"
            aria-label={muted ? "Ativar o som" : "Silenciar"}
            onClick={() => {
              ipc.setMuted(!muted);
              useMediaStore.setState({ volume: { level, muted: !muted } });
            }}
          >
            <VolumeIcon level={level} muted={muted} />
          </button>
          <input
            className="vol-slider"
            type="range"
            min={0}
            max={100}
            value={Math.round(level * 100)}
            aria-label="Volume"
            onChange={(e) => {
              const next = Number(e.target.value) / 100;
              ipc.setVolume(next);
              useMediaStore.setState({ volume: { level: next, muted: false } });
            }}
          />
        </div>
      </div>
    </div>
  );
}
