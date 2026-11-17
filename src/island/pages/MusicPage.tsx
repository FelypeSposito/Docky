import { useCallback, useEffect, useRef, useState } from "react";
import { useConfigStore } from "../../config/useConfig";
import { ipc } from "../../lib/ipc";
import { lineIndexAt } from "../../media/lrc";
import { useMediaStore, usePositionMs } from "../../media/store";
import { EmptyState } from "../EmptyState";
import { LyricsIcon, MusicIcon, NextIcon, PauseIcon, PlayIcon, PrevIcon, RepeatIcon, ShuffleIcon, VolumeIcon } from "../icons";
import type { RepeatMode, Volume } from "../../lib/ipc";

/** Repetir passa por: desligado, a lista toda, só esta faixa. */
const NEXT_REPEAT: Record<RepeatMode, RepeatMode> = { none: "list", list: "track", track: "none" };
const REPEAT_LABEL: Record<RepeatMode, string> = { none: "Repetir: desligado", list: "Repetir: a lista", track: "Repetir: esta música" };
const OUTSIDE = "Este app não deixa mudar por aqui";

const fmt = (ms: number) => {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

const LYRIC_ROW = 24;
const NOTICE_MS = 4000;

const lyricsNotice = (status: "loading" | "found" | "none" | "error") =>
  status === "loading" ? "Buscando a letra…" : status === "error" ? "Não consegui buscar a letra agora" : "Não encontrei a letra desta música";

export function MusicPage({ active }: { active: boolean }) {
  const media = useMediaStore((s) => s.media);
  const thumbnail = useMediaStore((s) => s.thumbnail);
  const lyrics = useMediaStore((s) => s.lyrics);
  const lyricsStatus = useMediaStore((s) => s.lyricsStatus);
  const volume = useMediaStore((s) => s.volume);
  const delay = useConfigStore((s) => s.config.lyricDelayMs);
  const lines = lyrics?.synced ?? null;

  const [showLyrics, setShowLyrics] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [dragRatio, setDragRatio] = useState<number | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const position = usePositionMs(active && !!media);

  // The slider here is the volume of the app that is playing (Spotify, Chrome…), not the whole PC: that one is on the
  // Som page. Read while the page is open; null when the app has no audio session yet (then it falls back to the PC).
  const [appVolume, setAppVolume] = useState<Volume | null>(null);
  const holding = useRef(false);
  const playingApp = media?.app;
  useEffect(() => {
    if (!active || !playingApp) return;
    let alive = true;
    const read = () => void ipc.mediaAppVolume().then((v) => alive && !holding.current && setAppVolume(v));
    read();
    const timer = setInterval(read, 1500);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [active, playingApp]);

  const say = useCallback((text: string) => {
    setNotice(text);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), NOTICE_MS);
  }, []);
  useEffect(() => () => clearTimeout(noticeTimer.current), []);

  // Com a letra ligada e a faixa sem letra (a música mudou, ou nenhuma fonte tem), volta ao player e avisa.
  useEffect(() => {
    if (!showLyrics || lines || lyricsStatus === "loading") return;
    setShowLyrics(false);
    say(lyricsNotice(lyricsStatus));
  }, [showLyrics, lines, lyricsStatus, say]);

  if (!media) {
    return (
      <EmptyState title="Nada tocando agora" text="Toque algo no Spotify ou no navegador para controlar por aqui." />
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

  const current = lines ? lineIndexAt(lines, position, delay) : -1;

  const ownVolume = appVolume !== null;
  const level = (ownVolume ? appVolume.level : volume?.level) ?? 0;
  const muted = (ownVolume ? appVolume.muted : volume?.muted) ?? false;
  const setLevel = (next: number) => {
    if (ownVolume) {
      ipc.setMediaAppVolume(next);
      setAppVolume({ level: next, muted: false });
    } else {
      ipc.setVolume(next);
      useMediaStore.setState({ volume: { level: next, muted: false } });
    }
  };
  const setMuted = (next: boolean) => {
    if (ownVolume) {
      ipc.setMediaAppMuted(next);
      setAppVolume({ level, muted: next });
    } else {
      ipc.setMuted(next);
      useMediaStore.setState({ volume: { level, muted: next } });
    }
  };

  return (
    <div className={`mp${showLyrics ? " lyr" : ""}`}>
      <button className="m-top" aria-label={`Abrir ${media.title} no app`} onClick={() => ipc.mediaOpenApp()}>
        <span className="cover" style={thumbnail ? { backgroundImage: `url(${thumbnail})` } : undefined}>
          {!thumbnail && <MusicIcon size={26} />}
        </span>
        <span className="m-meta">
          <span className="m-title">{media.title}</span>
          <span className="m-artist">{media.artist || media.app}</span>
        </span>
      </button>

      {notice && (
        <div className="m-note" role="status">
          {notice}
        </div>
      )}

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
          className={`ib${showLyrics ? " on" : ""}${lines ? "" : " dim"}`}
          aria-label="Letra"
          title={lines ? "Mostrar a letra" : lyricsNotice(lyricsStatus)}
          onClick={() => (lines ? setShowLyrics((v) => !v) : say(lyricsNotice(lyricsStatus)))}
        >
          <LyricsIcon />
        </button>
        <div className="mid">
          <button
            className={`ib sm${media.shuffle ? " on" : ""}`}
            aria-label="Aleatório"
            aria-pressed={!!media.shuffle}
            title={media.shuffle === null ? OUTSIDE : media.shuffle ? "Aleatório: ligado" : "Aleatório: desligado"}
            disabled={media.shuffle === null}
            onClick={() => {
              const next = !media.shuffle;
              ipc.mediaControl(next ? "shuffle-on" : "shuffle-off");
              useMediaStore.setState({ media: { ...media, shuffle: next, thumbnail: null } });
            }}
          >
            <ShuffleIcon />
          </button>
          <button className="ib big" aria-label="Anterior" onClick={() => ipc.mediaControl("previous")}>
            <PrevIcon />
          </button>
          <button className="ib big" aria-label={media.playing ? "Pausar" : "Tocar"} onClick={() => ipc.mediaControl("toggle")}>
            {media.playing ? <PauseIcon /> : <PlayIcon />}
          </button>
          <button className="ib big" aria-label="Próxima" onClick={() => ipc.mediaControl("next")}>
            <NextIcon />
          </button>
          <button
            className={`ib sm${media.repeat && media.repeat !== "none" ? " on" : ""}`}
            aria-label="Repetir"
            title={media.repeat === null ? OUTSIDE : REPEAT_LABEL[media.repeat]}
            disabled={media.repeat === null}
            onClick={() => {
              if (!media.repeat) return;
              const next = NEXT_REPEAT[media.repeat];
              ipc.mediaControl(`repeat-${next}`);
              useMediaStore.setState({ media: { ...media, repeat: next, thumbnail: null } });
            }}
          >
            <RepeatIcon one={media.repeat === "track"} />
          </button>
        </div>
        <div className="vol">
          <button
            className="ib"
            aria-label={muted ? "Ativar o som" : "Silenciar"}
            onClick={() => setMuted(!muted)}
          >
            <VolumeIcon level={level} muted={muted} />
          </button>
          <input
            className="vol-slider"
            type="range"
            min={0}
            max={100}
            value={Math.round(level * 100)}
            aria-label={ownVolume ? `Volume do ${media.app.replace(/\.exe$/i, "")}` : "Volume"}
            onPointerDown={() => (holding.current = true)}
            onPointerUp={() => (holding.current = false)}
            onChange={(e) => setLevel(Number(e.target.value) / 100)}
          />
        </div>
      </div>
    </div>
  );
}
