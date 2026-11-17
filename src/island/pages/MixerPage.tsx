import { useEffect, useRef, useState } from "react";
import { type AudioApp, ipc } from "../../lib/ipc";
import { useMediaStore } from "../../media/store";
import { inDiscordCall, useActivityStore } from "../activity";
import { DiscordCall } from "../DiscordCall";
import { VolumeIcon } from "../icons";

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

/** O volume de cada app, como o mixer do Windows: o geral no topo e cada programa que abriu o som embaixo. */
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

  return (
    <div className="mx">
      {inDiscordCall(discord) && (
        <DiscordCall discord={discord} since={callSince} />
      )}
      {/* The whole PC is the first row of the list and scrolls with the apps, instead of a fixed bar above them. */}
      <div className="mx-list">
        <div className="mx-row master">
          <button
            className="mx-mute"
            aria-label={muted ? "Ativar o som" : "Silenciar tudo"}
            title={muted ? "Ativar o som" : "Silenciar tudo"}
            onClick={() => {
              ipc.setMuted(!muted);
              useMediaStore.setState({ volume: { level, muted: !muted } });
            }}
          >
            <VolumeIcon level={level} muted={muted} size={17} />
          </button>
          <span className="mx-name">Volume geral</span>
          <input
            className="vol-slider mx-slider"
            type="range"
            min={0}
            max={100}
            value={Math.round(level * 100)}
            aria-label="Volume geral"
            style={{ "--v": `${level * 100}%` } as React.CSSProperties}
            onChange={(e) => {
              const next = Number(e.target.value) / 100;
              sendMaster("master", next);
              useMediaStore.setState({ volume: { level: next, muted: false } });
            }}
          />
          <span className="mx-pct">{muted ? "—" : percent(level)}</span>
        </div>
        {apps !== null && apps.length === 0 && (
          <div className="mx-empty">Nenhum app abriu o som agora</div>
        )}
        {(apps ?? []).map((app) => (
          <div
            key={app.id}
            className={`mx-row${app.active ? " live" : ""}${app.muted ? " off" : ""}`}
          >
            <button
              className="mx-mute app"
              aria-label={
                app.muted
                  ? `Ativar o som de ${app.name}`
                  : `Silenciar ${app.name}`
              }
              title={app.muted ? "Ativar o som" : "Silenciar"}
              onClick={() => {
                ipc.setAppMuted(app.id, !app.muted);
                change(app.id, { muted: !app.muted });
              }}
            >
              {app.icon ? (
                <img src={app.icon} alt="" />
              ) : (
                <span className="mx-letter">{app.name.slice(0, 1)}</span>
              )}
              {app.muted && (
                <span className="mx-x" aria-hidden="true">
                  <VolumeIcon muted size={11} />
                </span>
              )}
            </button>
            <span className="mx-name" title={app.name}>
              {app.name}
              {app.active && <i className="mx-dot" title="Tocando agora" />}
            </span>
            <input
              className="vol-slider mx-slider"
              type="range"
              min={0}
              max={100}
              value={Math.round(app.volume * 100)}
              aria-label={`Volume de ${app.name}`}
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
            <span className="mx-pct">
              {app.muted ? "—" : percent(app.volume)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
