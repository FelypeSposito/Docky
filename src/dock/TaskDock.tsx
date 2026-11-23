import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useConfigStore } from "../config/useConfig";
import { t } from "../i18n";
import { createHoverController } from "../island/hoverController";
import { useNow } from "../island/hooks";
import { MicIcon, MicOffIcon, VolumeIcon } from "../island/icons";
import { islandAccent } from "../island/theme";
import { formatClock } from "../lib/format";
import { type DockApp, ipc, type Volume } from "../lib/ipc";
import { Spring } from "../lib/spring";
import "./dock.css";

type Side = "bottom" | "left" | "right";
const sideOf = (value: string): Side => (value === "left" || value === "right" ? value : "bottom");

/** The dock's size follows its content on the island's spring: a little bounce when it grows, a soft landing back. */
function useBoxSpring(boxRef: React.RefObject<HTMLDivElement | null>, contentRef: React.RefObject<HTMLDivElement | null>, reduceMotion: boolean) {
  useLayoutEffect(() => {
    const box = boxRef.current;
    const content = contentRef.current;
    if (!box || !content) return;
    const w = new Spring(content.offsetWidth);
    const h = new Spring(content.offsetHeight);
    let raf = 0;
    let last = 0;
    const paint = () => {
      box.style.width = `${w.x}px`;
      box.style.height = `${h.x}px`;
    };
    paint();
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const response = reduceMotion ? 0.18 : 0.42;
      const damping = reduceMotion ? 1 : 0.78;
      w.step(dt, response, damping);
      h.step(dt, response, damping);
      paint();
      if (w.settled && h.settled) {
        w.snap(w.target);
        h.snap(h.target);
        paint();
        raf = 0;
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    const observer = new ResizeObserver(() => {
      w.target = content.offsetWidth;
      h.target = content.offsetHeight;
      if (!raf) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    });
    observer.observe(content);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [boxRef, contentRef, reduceMotion]);
}

/** Four small squares: the Start menu. */
const StartIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
    {[
      [3.5, 3.5],
      [13, 3.5],
      [3.5, 13],
      [13, 13],
    ].map(([x, y]) => (
      <rect key={`${x}-${y}`} x={x} y={y} width="7.5" height="7.5" rx="2.2" fill="currentColor" />
    ))}
  </svg>
);

/** An arrow toward the open screen: Windows' taskbar for a moment, to reach the tray icons. */
const TrayUpIcon = ({ side }: { side: Side }) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ rotate: side === "left" ? "90deg" : side === "right" ? "-90deg" : "0deg" }}>
    <path d="M6 15l6-6 6 6" />
  </svg>
);

function AppIcon({ app, size }: { app: DockApp; size: number }) {
  if (app.icon) return <img className="td-img" src={app.icon} alt="" width={size} height={size} draggable={false} />;
  return (
    <span className="td-letter" style={{ width: size, height: size, fontSize: size * 0.42 }}>
      {(app.name.trim()[0] ?? "?").toUpperCase()}
    </span>
  );
}

/**
 * Docky's taskbar: a black pill on the bottom, left or right edge with the open apps, that grows like the island when
 * the mouse comes over it, with Start, the pinned apps, each app's windows and a small system corner. The window it
 * lives in never takes focus (dock.rs), so clicking an app here behaves like the Windows taskbar.
 */
export function TaskDock() {
  const config = useConfigStore((s) => s.config);
  const side = sideOf(config.dockSide);
  const vertical = side !== "bottom";
  const glass = config.material === "glass";
  const accent = islandAccent(config.islandColor, null);
  const [apps, setApps] = useState<DockApp[]>([]);
  const [open, setOpen] = useState(false);
  /** The app whose windows (or menu) are shown next to it. */
  const [pop, setPop] = useState<{ key: string; kind: "windows" | "menu" } | null>(null);
  const [volume, setVolume] = useState<Volume | null>(null);
  const [mic, setMic] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const now = useNow();

  const rootRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  useBoxSpring(boxRef, contentRef, config.reduceMotion);

  useEffect(() => {
    void ipc.dockApps().then(setApps);
    return ipc.onDockApps(setApps);
  }, []);

  // Grows when the mouse comes over it, and shrinks back a moment after it leaves (like the island).
  const openRef = useRef(open);
  openRef.current = open;
  useEffect(() => {
    const controller = createHoverController({
      expandDelay: 90,
      collapseDelay: 420,
      canExpand: () => !openRef.current,
      canCollapse: () => openRef.current,
      expand: () => setOpen(true),
      collapse: () => {
        setOpen(false);
        setPop(null);
      },
    });
    const off = ipc.onHover((inside) => controller.setHover(inside));
    return () => {
      off();
      controller.dispose();
    };
  }, []);

  // The system corner is read when the dock opens.
  useEffect(() => {
    if (!open) return;
    void ipc.getVolume().then(setVolume);
    void ipc.audioState().then((s) => setMic(s.mic ? s.mic.muted : null));
  }, [open]);

  // Tells Rust where the dock is (dock, ears and any open list), so clicks elsewhere go to the apps underneath.
  const report = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    root.querySelectorAll<HTMLElement>(".td, .td-pop").forEach((el) => {
      const r = el.getBoundingClientRect();
      left = Math.min(left, r.left - 16);
      top = Math.min(top, r.top - 16);
      right = Math.max(right, r.right + 16);
      bottom = Math.max(bottom, r.bottom + 16);
    });
    if (Number.isFinite(left)) ipc.setIslandRect({ x: left, y: top, w: right - left, h: bottom - top });
  }, []);
  useEffect(() => {
    report();
    const observer = new ResizeObserver(report);
    if (boxRef.current) observer.observe(boxRef.current);
    window.addEventListener("resize", report);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", report);
    };
  }, [report, pop, open]);

  const flash = (message: string) => {
    setError(message);
    setTimeout(() => setError(null), 3500);
  };
  const run = (action: Promise<void>) => void action.catch((e) => flash(e instanceof Error ? e.message : String(e)));

  const activate = (app: DockApp) => {
    if (open && app.windows.length > 1 && !app.focused) {
      setPop((current) => (current?.key === app.key && current.kind === "windows" ? null : { key: app.key, kind: "windows" }));
      return;
    }
    setPop(null);
    run(ipc.dockActivate(app.key));
  };

  const shown = pop ? apps.find((a) => a.key === pop.key) ?? null : null;
  const icon = open ? 30 : 22;
  const clock = formatClock(now, config.clock12h);
  const date = useMemo(() => `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}`, [now]);

  return (
    <div
      ref={rootRef}
      className={`td-root side-${side}${glass ? " glass" : ""}${config.glassEdge ? "" : " no-edge"}${open ? " open" : ""}`}
      style={{ "--accent": accent.primary } as React.CSSProperties}
    >
      <div ref={boxRef} className="td">
        <i className="td-ear a" aria-hidden="true" />
        <i className="td-ear b" aria-hidden="true" />
        <div className="td-body">
          <div ref={contentRef} className={`td-in${vertical ? " col" : ""}`} role="toolbar" aria-label={t("Dock")} aria-orientation={vertical ? "vertical" : "horizontal"}>
            {open && (
              <>
                <button className="td-btn start" aria-label={t("Iniciar")} title={t("Iniciar")} onClick={() => ipc.dockStartMenu()}>
                  <StartIcon />
                </button>
                <i className="td-sep" aria-hidden="true" />
              </>
            )}
            {apps.length === 0 && <span className="td-empty">{t("Nenhum app aberto")}</span>}
            {apps.map((app) => {
              const running = app.windows.length > 0;
              const minimized = running && app.windows.every((w) => w.minimized);
              return (
                <button
                  key={app.key}
                  className={`td-app${app.focused ? " on" : ""}${running ? "" : " idle"}${minimized ? " min" : ""}${pop?.key === app.key ? " pop" : ""}`}
                  aria-label={app.name}
                  title={open ? undefined : app.name}
                  data-key={app.key}
                  onClick={() => activate(app)}
                  onAuxClick={(e) => {
                    if (e.button === 1 && app.path) run(ipc.dockLaunch(app.path));
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    if (!openRef.current) setOpen(true);
                    setPop({ key: app.key, kind: "menu" });
                  }}
                >
                  <AppIcon app={app} size={icon} />
                  {running && <i className="td-dot" aria-hidden="true" />}
                  {open && <span className="td-name">{app.name}</span>}
                </button>
              );
            })}
            {open && (
              <>
                <i className="td-sep" aria-hidden="true" />
                <div className={`td-sys${vertical ? " col" : ""}`}>
                  {mic !== null && (
                    <button
                      className={`td-btn${mic ? " off" : ""}`}
                      aria-pressed={mic}
                      aria-label={t(mic ? "Ativar o microfone" : "Mutar o microfone")}
                      title={t(mic ? "Ativar o microfone" : "Mutar o microfone")}
                      onClick={() => {
                        const next = !mic;
                        setMic(next);
                        void ipc.setDefaultMicMuted(next).then((ok) => !ok && setMic(!next));
                      }}
                    >
                      {mic ? <MicOffIcon /> : <MicIcon />}
                    </button>
                  )}
                  {volume && (
                    <button
                      className="td-btn"
                      aria-label={t(volume.muted ? "Ativar o som" : "Silenciar tudo")}
                      title={`${t("Volume geral")}: ${volume.muted ? "—" : `${Math.round(volume.level * 100)}%`}`}
                      onClick={() => {
                        const next = { ...volume, muted: !volume.muted };
                        setVolume(next);
                        ipc.setMuted(next.muted);
                      }}
                      onWheel={(e) => {
                        const level = Math.min(1, Math.max(0, volume.level + (e.deltaY < 0 ? 0.05 : -0.05)));
                        setVolume({ level, muted: false });
                        ipc.setVolume(level);
                      }}
                    >
                      <VolumeIcon level={volume.level} muted={volume.muted} size={16} />
                    </button>
                  )}
                  <button className="td-btn" aria-label={t("Bandeja do Windows")} title={t("Bandeja do Windows")} onClick={() => ipc.dockPeekTaskbar()}>
                    <TrayUpIcon side={side} />
                  </button>
                  <span className="td-clock" aria-label={`${clock}, ${date}`}>
                    <b>{clock}</b>
                    <em>{date}</em>
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {shown && pop && (
        <DockPopover
          app={shown}
          kind={pop.kind}
          side={side}
          root={rootRef}
          onClose={() => setPop(null)}
          onPin={(pin) => run(ipc.dockPin(shown.path, pin))}
          onLaunch={() => run(ipc.dockLaunch(shown.path))}
          onPlaced={report}
        />
      )}
      {error && <div className="td-error">{t(error)}</div>}
    </div>
  );
}

/** An app's windows (click one to bring it forward, × to close it), or its menu (right click). */
function DockPopover({
  app,
  kind,
  side,
  root,
  onClose,
  onPin,
  onLaunch,
  onPlaced,
}: {
  app: DockApp;
  kind: "windows" | "menu";
  side: Side;
  root: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onPin: (pin: boolean) => void;
  onLaunch: () => void;
  onPlaced: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Sits next to its app's button, on the open side of the screen.
  useLayoutEffect(() => {
    const el = ref.current;
    const button = root.current?.querySelector<HTMLElement>(`.td-app[data-key="${CSS.escape(app.key)}"]`);
    const dock = root.current?.querySelector<HTMLElement>(".td");
    if (!el || !button || !dock) return;
    const b = button.getBoundingClientRect();
    const d = dock.getBoundingClientRect();
    const gap = 10;
    if (side === "bottom") {
      const left = Math.min(window.innerWidth - el.offsetWidth - 8, Math.max(8, b.left + b.width / 2 - el.offsetWidth / 2));
      el.style.left = `${left}px`;
      el.style.top = `${d.top - el.offsetHeight - gap}px`;
    } else {
      const top = Math.min(window.innerHeight - el.offsetHeight - 8, Math.max(8, b.top + b.height / 2 - el.offsetHeight / 2));
      el.style.top = `${top}px`;
      el.style.left = side === "left" ? `${d.right + gap}px` : `${d.left - el.offsetWidth - gap}px`;
    }
    onPlaced();
  });

  return (
    <div ref={ref} className="td-pop" role="menu" aria-label={app.name}>
      <b className="td-pop-h">{app.name}</b>
      {kind === "windows" &&
        app.windows.map((w) => (
          <div key={w.id} className={`td-win${w.minimized ? " min" : ""}`} role="menuitem">
            <button
              className="td-win-t"
              title={w.title}
              onClick={() => {
                ipc.dockFocusWindow(w.id);
                onClose();
              }}
            >
              {w.title}
            </button>
            <button className="td-win-x" aria-label={t("Fechar esta janela")} title={t("Fechar esta janela")} onClick={() => ipc.dockCloseWindow(w.id)}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        ))}
      {kind === "menu" && (
        <>
          {app.windows.length > 0 && (
            <button className="td-act" role="menuitem" onClick={() => { app.windows.forEach((w) => ipc.dockFocusWindow(w.id)); onClose(); }}>
              {t("Mostrar")}
            </button>
          )}
          {app.path && (
            <button className="td-act" role="menuitem" onClick={() => { onLaunch(); onClose(); }}>
              {t("Nova janela")}
            </button>
          )}
          {app.path && (
            <button className="td-act" role="menuitem" onClick={() => { onPin(!app.pinned); onClose(); }}>
              {t(app.pinned ? "Tirar do dock" : "Fixar no dock")}
            </button>
          )}
          {app.windows.length > 0 && (
            <button className="td-act danger" role="menuitem" onClick={() => { app.windows.forEach((w) => ipc.dockCloseWindow(w.id)); onClose(); }}>
              {t(app.windows.length > 1 ? "Fechar todas as janelas" : "Fechar a janela")}
            </button>
          )}
        </>
      )}
    </div>
  );
}
