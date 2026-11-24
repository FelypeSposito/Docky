import { useEffect, useRef, useState } from "react";
import { type AudioApp, ipc } from "../../lib/ipc";
import { useMediaStore } from "../../media/store";
import { inDiscordCall, useActivityStore } from "../activity";
import { DiscordCall } from "../DiscordCall";
import { VolumeIcon } from "../icons";
import { plural, t } from "../../i18n";
import { OutputRow } from "./OutputRow";

const POLL_MS = 1500;
/** Mexer no volume chama o Windows; com o controle arrastando, manda no máximo a cada 40 ms e o valor final. */
const SEND_EVERY_MS = 40;

/** Envia `send(value)` com folga enquanto o controle arrasta, garantindo que o último valor sempre vai. */
function useThrottled(send: (id: string, value: number) => void) {
  const last = useRef(new Map<string, number>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  return (id: string, value: number) => {
    clearTimeout(timers.current.get(id));
    const wait =
      SEND_EVERY_MS - (performance.now() - (last.current.get(id) ?? 0));
    const fire = () => {
      last.current.set(id, performance.now());
      send(id, value);
    };
    if (wait <= 0) fire();
    else timers.current.set(id, setTimeout(fire, wait));
  };
}

const percent = (level: number) => `${Math.round(level * 100)}`;

/**
 * Som: the call across the top while you are in one, the whole PC at left (volume, output, microphone) and each app
 * that opened the sound at right. It opens at the island's large size: it holds too much for the small one.
 */
export function MixerPage({ active }: { active: boolean }) {
  const [apps, setApps] = useState<AudioApp[] | null>(null);
  const volume = useMediaStore((s) => s.volume);
  const discord = useActivityStore((s) => s.discord);
  const callSince = useActivityStore((s) => s.call?.since ?? null);
  /** O app cujo controle está sendo arrastado: a leitura periódica não sobrescreve o valor dele. */
  const dragging = useRef<string | null>(null);
  const sendApp = useThrottled((id, level) => ipc.setAppVolume(id, level));
  const sendMaster = useThrottled((_, level) => ipc.setVolume(level));

  // Só pergunta ao Windows enquanto a página está aberta.
  useEffect(() => {
    if (!active) return;
    let alive = true;
    const read = () =>
      void ipc.audioApps().then((next) => {
        if (!alive) return;
        setApps((current) =>
          next.map((app) => {
            const held =
              dragging.current === app.id &&
              current?.find((c) => c.id === app.id);
            return held
              ? { ...app, volume: held.volume, muted: held.muted }
              : app;
          }),
        );
      });
    read();
    const timer = setInterval(read, POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [active]);

  const change = (id: string, patch: Partial<AudioApp>) =>
    setApps(
      (current) =>
        current?.map((app) => (app.id === id ? { ...app, ...patch } : app)) ??
        current,
    );

  const level = volume?.level ?? 0;
  const muted = volume?.muted ?? false;

  const call = inDiscordCall(discord);
  const playingNow = (apps ?? []).filter((app) => app.active).length;

  return (
    <div className={`mx${call ? " in-call" : ""}`}>
      {call && (
        <div className="tile mx-call">
          <DiscordCall discord={discord} since={callSince} />
        </div>
      )}
      {/* The whole PC: how loud, where the sound goes, and the microphone. */}
      <div className="tile mx-pc">
        <div className="mx-master">
          <button
            className="mx-mute"
            aria-label={t(muted ? "Ativar o som" : "Silenciar tudo")}
            title={t(muted ? "Ativar o som" : "Silenciar tudo")}
            onClick={() => {
              ipc.setMuted(!muted);
              useMediaStore.setState({ volume: { level, muted: !muted } });
            }}
          >
            <VolumeIcon level={level} muted={muted} size={17} />
          </button>
          <span className="mx-name">{t("Volume geral")}</span>
          <span className="mx-pct">{muted ? "—" : percent(level)}</span>
        </div>
        <input
          className={`vol-slider mx-slider${muted ? " off" : ""}`}
          type="range"
          min={0}
          max={100}
          value={Math.round(level * 100)}
          aria-label={t("Volume geral")}
          style={{ "--v": `${level * 100}%` } as React.CSSProperties}
          onChange={(e) => {
            const next = Number(e.target.value) / 100;
            sendMaster("master", next);
            useMediaStore.setState({ volume: { level: next, muted: false } });
          }}
        />
        <OutputRow active={active} />
      </div>
      {/* Each app that opened the sound, as Windows' volume mixer lists them. */}
      <div className="tile mx-apps">
        <div className="mx-head">
          <b>{t("Apps")}</b>
          {playingNow > 0 && <span>{plural(playingNow, "1 tocando agora", "{n} tocando agora")}</span>}
        </div>
        <div className="mx-list">
          {apps !== null && apps.length === 0 && <div className="mx-empty">{t("Nenhum app abriu o som agora")}</div>}
          {(apps ?? []).map((app) => (
            <div key={app.id} className={`mx-row${app.active ? " live" : ""}${app.muted ? " off" : ""}`}>
              <button
                className="mx-mute app"
                aria-label={app.muted ? t("Ativar o som de {app}", { app: t(app.name) }) : t("Silenciar {app}", { app: t(app.name) })}
                title={t(app.muted ? "Ativar o som" : "Silenciar")}
                onClick={() => {
                  ipc.setAppMuted(app.id, !app.muted);
                  change(app.id, { muted: !app.muted });
                }}
              >
                {app.icon ? <img src={app.icon} alt="" /> : <span className="mx-letter">{app.name.slice(0, 1)}</span>}
                {app.muted && (
                  <span className="mx-x" aria-hidden="true">
                    <VolumeIcon muted size={11} />
                  </span>
                )}
              </button>
              <span className="mx-name" title={t(app.name)}>
                <span className="mx-label">{t(app.name)}</span>
                {app.active && <i className="mx-dot" title={t("Tocando agora")} />}
              </span>
              <input
                className="vol-slider mx-slider"
                type="range"
                min={0}
                max={100}
                value={Math.round(app.volume * 100)}
                aria-label={t("Volume de {app}", { app: t(app.name) })}
                style={{ "--v": `${app.volume * 100}%` } as React.CSSProperties}
                onPointerDown={() => (dragging.current = app.id)}
                onPointerUp={() => (dragging.current = null)}
                onChange={(e) => {
                  const next = Number(e.target.value) / 100;
                  sendApp(app.id, next);
                  if (app.muted) ipc.setAppMuted(app.id, false);
                  change(app.id, { volume: next, muted: false });
                }}
              />
              <span className="mx-pct">{app.muted ? "—" : percent(app.volume)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
