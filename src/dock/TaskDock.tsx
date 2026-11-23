import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useConfigStore } from "../config/useConfig";
import { t } from "../i18n";
import { createHoverController, type HoverController } from "../island/hoverController";
import { useNow } from "../island/hooks";
import { MicIcon, MicOffIcon, VolumeIcon } from "../island/icons";
import { islandAccent } from "../island/theme";
import { formatClock } from "../lib/format";
import { type DockApp, ipc, type Volume } from "../lib/ipc";
import { Spring } from "../lib/spring";
import { DockPopover, type Pop, placeNear, type Side } from "./DockPopover";
import { AppIcon, QuickIcon, SearchIcon, StartIcon, TaskViewIcon, TrayUpIcon } from "./icons";
import { dropIndex, moveKey, slideFor } from "./order";
import "./dock.css";

const sideOf = (value: string): Side => (value === "left" || value === "right" ? value : "bottom");

/** Hovering an open app this long shows its windows; once one preview is up, the next app's shows at once. */
const PREVIEW_DELAY = 420;
/** The name of a button or of a closed app. */
const TIP_DELAY = 450;
/** Leaving an app and its preview: how long the preview waits (time to cross the gap between them). */
const CLOSE_DELAY = 280;
/** How far the mouse moves with the button down before it is a drag and not a click. */
const DRAG_START = 6;

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

/** A drag in progress: the app's place before (`from`), where it would land (`to`), how far it moved. */
interface Drag {
  key: string;
  from: number;
  to: number;
  delta: number;
  step: number;
}

/**
 * Docky's taskbar: a black slab on the bottom, left or right edge with the open apps, that grows like the island when
 * the mouse comes over it. Open, it is a Windows taskbar made calmer: Start, search and task view; the apps, pinned or
 * open, in an order you drag; live previews of an app's windows on hover; a menu on right click; the system corner;
 * and the show-desktop corner at the end of the screen's edge (Win+D). The window it lives in never takes focus
 * (dock.rs), so clicking an app here behaves like the Windows taskbar.
 */
export function TaskDock() {
  const config = useConfigStore((s) => s.config);
  const side = sideOf(config.dockSide);
  const vertical = side !== "bottom";
  const glass = config.material === "glass";
  const accent = islandAccent(config.islandColor, null);
  const [apps, setApps] = useState<DockApp[]>([]);
  const [open, setOpen] = useState(false);
  const [pop, setPop] = useState<Pop | null>(null);
  const [tip, setTip] = useState<{ text: string; el: HTMLElement } | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  /** One frame without transitions after a drop, so the apps land in their new places without sliding again. */
  const [settling, setSettling] = useState(false);
  const [volume, setVolume] = useState<Volume | null>(null);
  const [mic, setMic] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const now = useNow();

  const rootRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  useBoxSpring(boxRef, contentRef, config.reduceMotion);

  const openRef = useRef(open);
  openRef.current = open;
  const popRef = useRef(pop);
  popRef.current = pop;
  const tipShownRef = useRef(tip);
  tipShownRef.current = tip;
  const dragRef = useRef<(Drag & { start: number; active: boolean; centers: number[] }) | null>(null);
  const hoverRef = useRef(false);
  /** A drop is followed by a click on the same app: that click is not a click. */
  const droppedRef = useRef(false);
  const controllerRef = useRef<HoverController | null>(null);
  const timers = useRef<{ preview?: number; close?: number; tip?: number }>({});
  const clearTimer = (name: "preview" | "close" | "tip") => {
    window.clearTimeout(timers.current[name]);
    timers.current[name] = undefined;
  };

  useEffect(() => {
    void ipc.dockApps().then(setApps);
    return ipc.onDockApps((next) => {
      // A drag in progress keeps the order it started with; the drop sends the new one.
      if (!dragRef.current?.active) setApps(next);
    });
  }, []);

  // Grows when the mouse comes over it, and shrinks back a moment after it leaves (like the island).
  useEffect(() => {
    const controller = createHoverController({
      expandDelay: 90,
      collapseDelay: 420,
      canExpand: () => !openRef.current,
      canCollapse: () => openRef.current && !dragRef.current?.active,
      expand: () => setOpen(true),
      collapse: () => {
        setOpen(false);
        setPop(null);
        setTip(null);
      },
    });
    controllerRef.current = controller;
    const offHover = ipc.onHover((inside) => {
      hoverRef.current = inside;
      controller.setHover(inside);
    });
    // A click anywhere else closes a menu.
    const offOutside = ipc.onOutsideClick(() => setPop((p) => (p && p.kind !== "preview" ? null : p)));
    return () => {
      offHover();
      offOutside();
      controller.dispose();
      for (const id of Object.values(timers.current)) window.clearTimeout(id);
    };
  }, []);

  // The system corner is read when the dock opens.
  useEffect(() => {
    if (!open) return;
    void ipc.getVolume().then(setVolume);
    void ipc.audioState().then((s) => setMic(s.mic ? s.mic.muted : null));
  }, [open]);

  // Tells Rust which parts of the window take clicks: the dock with any open panel (hovered), and the show-desktop
  // corner (clicked only). Everywhere else, clicks go to the apps underneath.
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
    if (!Number.isFinite(left)) return;
    const rects = [{ x: left, y: top, w: right - left, h: bottom - top }];
    const corner = root.querySelector<HTMLElement>(".td-corner")?.getBoundingClientRect();
    if (corner) rects.push({ x: corner.left, y: corner.top, w: corner.width, h: corner.height });
    ipc.setHitRects(rects);
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
  }, [report, pop, open, side]);

  // The tip sits by its button, on the open side of the screen.
  useLayoutEffect(() => {
    const el = tipRef.current;
    const dock = boxRef.current;
    if (!el || !tip || !dock) return;
    const anchor = tip.el.getBoundingClientRect();
    placeNear(el, anchor, tip.el.closest(".td") ? dock.getBoundingClientRect() : anchor, side, 8);
  }, [tip, side]);

  const flash = (message: string) => {
    setError(message);
    setTimeout(() => setError(null), 3500);
  };
  const run = (action: Promise<void>) => void action.catch((e) => flash(e instanceof Error ? e.message : String(e)));

  const hideTip = () => {
    clearTimer("tip");
    setTip(null);
  };
  /** The name of what the mouse is over, after a moment (at once when another tip is already up, like Windows). */
  const showTip = (text: string, el: HTMLElement) => {
    clearTimer("tip");
    if (dragRef.current?.active) return;
    if (tipShownRef.current) setTip({ text, el });
    else timers.current.tip = window.setTimeout(() => setTip({ text, el }), TIP_DELAY);
  };
  const tipProps = (text: string) => ({
    onPointerEnter: (e: React.PointerEvent<HTMLElement>) => showTip(text, e.currentTarget),
    onPointerLeave: hideTip,
  });

  const closePreviewSoon = () => {
    clearTimer("close");
    timers.current.close = window.setTimeout(() => setPop((p) => (p?.kind === "preview" ? null : p)), CLOSE_DELAY);
  };

  const enterApp = (app: DockApp, el: HTMLElement) => {
    clearTimer("close");
    clearTimer("preview");
    if (dragRef.current?.active || (popRef.current && popRef.current.kind !== "preview")) return;
    if (app.windows.length > 0 && openRef.current) {
      hideTip();
      if (popRef.current?.kind === "preview") setPop({ kind: "preview", key: app.key });
      else timers.current.preview = window.setTimeout(() => setPop({ kind: "preview", key: app.key }), PREVIEW_DELAY);
    } else {
      if (popRef.current?.kind === "preview") setPop(null);
      showTip(app.name, el);
    }
  };
  const leaveApp = () => {
    clearTimer("preview");
    hideTip();
    if (popRef.current?.kind === "preview") closePreviewSoon();
  };

  const activate = (app: DockApp, e: React.MouseEvent) => {
    if (droppedRef.current) {
      droppedRef.current = false;
      return;
    }
    clearTimer("preview");
    hideTip();
    setPop(null);
    // Shift+click opens another window, like on the Windows taskbar.
    if (e.shiftKey && app.path) run(ipc.dockLaunch(app.path));
    else run(ipc.dockActivate(app.key));
  };

  // Drag to reorder: the app follows the mouse along the dock, the others slide out of its way, and the drop keeps
  // the new order (pinned or not).
  const axis = (e: { clientX: number; clientY: number }) => (vertical ? e.clientY : e.clientX);
  const onAppPointerDown = (e: React.PointerEvent<HTMLButtonElement>, index: number, app: DockApp) => {
    if (e.button !== 0 || !openRef.current) return;
    dragRef.current = { key: app.key, from: index, to: index, delta: 0, step: 0, start: axis(e), active: false, centers: [] };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onAppPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const moved = axis(e) - d.start;
    if (!d.active) {
      if (Math.abs(moved) < DRAG_START) return;
      const buttons = Array.from(contentRef.current?.querySelectorAll<HTMLElement>(".td-app") ?? []);
      d.centers = buttons.map((b) => {
        const r = b.getBoundingClientRect();
        return vertical ? r.top + r.height / 2 : r.left + r.width / 2;
      });
      d.step = d.centers.length > 1 ? d.centers[1] - d.centers[0] : 44;
      d.active = true;
      clearTimer("preview");
      hideTip();
      setPop(null);
    }
    const min = d.centers[0] - d.centers[d.from];
    const max = d.centers[d.centers.length - 1] - d.centers[d.from];
    d.delta = Math.max(min, Math.min(max, moved));
    d.to = dropIndex(d.centers, d.from, d.centers[d.from] + d.delta);
    setDrag({ key: d.key, from: d.from, to: d.to, delta: d.delta, step: d.step });
  };
  const endDrag = (commit: boolean) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d?.active) return;
    droppedRef.current = commit;
    // A drop outside the button has no click to swallow.
    window.setTimeout(() => (droppedRef.current = false), 0);
    if (commit && d.to !== d.from) {
      const keys = moveKey(
        apps.map((a) => a.key),
        d.from,
        d.to,
      );
      setApps((list) => keys.map((k) => list.find((a) => a.key === k)).filter((a): a is DockApp => !!a));
      run(ipc.dockReorder(keys));
    }
    setSettling(true);
    setDrag(null);
    requestAnimationFrame(() => requestAnimationFrame(() => setSettling(false)));
    // The mouse may have left the dock while dragging: shrink now if it did.
    if (!hoverRef.current) controllerRef.current?.setHover(false);
  };

  const preview = pop && pop.kind !== "dock" ? apps.find((a) => a.key === pop.key) ?? null : null;
  const icon = open ? 26 : 22;
  const clock = formatClock(now, config.clock12h);
  const date = useMemo(() => `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}`, [now]);
  const volumeTip = volume ? `${t("Volume geral")}: ${volume.muted ? t("mudo") : `${Math.round(volume.level * 100)}%`} · ${t("role para ajustar")}` : "";

  return (
    <div
      ref={rootRef}
      className={`td-root side-${side}${glass ? " glass" : ""}${config.glassEdge ? "" : " no-edge"}${open ? " open" : ""}${drag ? " dragging" : ""}`}
      style={{ "--accent": accent.primary } as React.CSSProperties}
      onPointerDown={(e) => {
        // A click on the dock outside an open menu closes it.
        if (popRef.current && popRef.current.kind !== "preview" && !(e.target as HTMLElement).closest(".td-pop")) setPop(null);
      }}
    >
      <div ref={boxRef} className="td">
        <i className="td-ear a" aria-hidden="true" />
        <i className="td-ear b" aria-hidden="true" />
        <div className="td-body">
          <div
            ref={contentRef}
            className={`td-in${vertical ? " col" : ""}${settling ? " settle" : ""}`}
            role="toolbar"
            aria-label={t("Dock")}
            aria-orientation={vertical ? "vertical" : "horizontal"}
            onContextMenu={(e) => {
              e.preventDefault();
              if ((e.target as HTMLElement).closest(".td-app")) return;
              hideTip();
              setPop({ kind: "dock", x: e.clientX, y: e.clientY });
            }}
          >
            {open && (
              <div className={`td-group${vertical ? " col" : ""}`}>
                <button className="td-btn start" aria-label={t("Iniciar")} onClick={() => ipc.dockShortcut("start")} {...tipProps(t("Iniciar"))}>
                  <StartIcon />
                </button>
                <button className="td-btn" aria-label={t("Pesquisar")} onClick={() => ipc.dockShortcut("search")} {...tipProps(t("Pesquisar"))}>
                  <SearchIcon />
                </button>
                <button className="td-btn" aria-label={t("Visão de tarefas")} onClick={() => ipc.dockShortcut("taskView")} {...tipProps(t("Visão de tarefas"))}>
                  <TaskViewIcon />
                </button>
              </div>
            )}
            {open && <i className="td-sep" aria-hidden="true" />}
            {apps.length === 0 && <span className="td-empty">{t("Nenhum app aberto")}</span>}
            {apps.map((app, index) => {
              const running = app.windows.length > 0;
              const minimized = running && app.windows.every((w) => w.minimized);
              const dragged = drag?.key === app.key;
              const offset = drag ? (dragged ? drag.delta : slideFor(index, drag.from, drag.to, drag.step)) : 0;
              const shown = pop && pop.kind !== "dock" && pop.key === app.key;
              return (
                <button
                  key={app.key}
                  className={`td-app${app.focused ? " on" : ""}${running ? " run" : ""}${minimized ? " min" : ""}${shown ? " pop" : ""}${dragged ? " lifted" : ""}`}
                  aria-label={app.windows.length > 1 ? `${app.name} (${app.windows.length})` : app.name}
                  data-key={app.key}
                  style={offset ? { translate: vertical ? `0 ${offset}px` : `${offset}px 0` } : undefined}
                  onClick={(e) => activate(app, e)}
                  onAuxClick={(e) => {
                    if (e.button === 1 && app.path) run(ipc.dockLaunch(app.path));
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    clearTimer("preview");
                    hideTip();
                    if (!openRef.current) setOpen(true);
                    setPop({ kind: "menu", key: app.key });
                  }}
                  onPointerEnter={(e) => enterApp(app, e.currentTarget)}
                  onPointerLeave={leaveApp}
                  onPointerDown={(e) => onAppPointerDown(e, index, app)}
                  onPointerMove={onAppPointerMove}
                  onPointerUp={() => endDrag(true)}
                  onPointerCancel={() => endDrag(false)}
                >
                  <AppIcon app={app} size={icon} />
                  {running && <i className="td-dot" aria-hidden="true" />}
                  {open && app.windows.length > 1 && <b className="td-count" aria-hidden="true">{app.windows.length}</b>}
                </button>
              );
            })}
            {open && (
              <>
                <i className="td-sep" aria-hidden="true" />
                <div className={`td-group${vertical ? " col" : ""}`}>
                  {mic !== null && (
                    <button
                      className={`td-btn${mic ? " off" : ""}`}
                      aria-pressed={mic}
                      aria-label={t(mic ? "Ativar o microfone" : "Mutar o microfone")}
                      {...tipProps(t(mic ? "Ativar o microfone" : "Mutar o microfone"))}
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
                      {...tipProps(volumeTip)}
                      onClick={() => {
                        const next = { ...volume, muted: !volume.muted };
                        setVolume(next);
                        ipc.setMuted(next.muted);
                      }}
                      onWheel={(e) => {
                        const level = Math.min(1, Math.max(0, volume.level + (e.deltaY < 0 ? 0.05 : -0.05)));
                        setVolume({ level, muted: false });
                        ipc.setVolume(level);
                        if (tipShownRef.current) setTip({ text: `${t("Volume geral")}: ${Math.round(level * 100)}% · ${t("role para ajustar")}`, el: e.currentTarget });
                      }}
                    >
                      <VolumeIcon level={volume.level} muted={volume.muted} size={16} />
                    </button>
                  )}
                  <button className="td-btn" aria-label={t("Configurações rápidas")} onClick={() => ipc.dockShortcut("quickSettings")} {...tipProps(t("Wi-Fi, Bluetooth e brilho"))}>
                    <QuickIcon />
                  </button>
                  <button className="td-btn" aria-label={t("Bandeja do Windows")} onClick={() => ipc.dockPeekTaskbar()} {...tipProps(t("Bandeja do Windows"))}>
                    <TrayUpIcon side={side} />
                  </button>
                  <button
                    className="td-clock"
                    aria-label={`${clock}, ${date}. ${t("Notificações e calendário")}`}
                    onClick={() => ipc.dockShortcut("notifications")}
                    {...tipProps(t("Notificações e calendário"))}
                  >
                    <b>{clock}</b>
                    <em>{date}</em>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* The show-desktop corner at the end of the edge (Win+D), like the sliver at the end of Windows' taskbar. */}
      <button className="td-corner" aria-label={t("Mostrar a área de trabalho")} onClick={() => ipc.dockShortcut("desktop")} {...tipProps(t("Mostrar a área de trabalho"))}>
        <i aria-hidden="true" />
      </button>

      {pop && (pop.kind === "dock" || preview) && (
        <DockPopover
          key={pop.kind === "dock" ? "dock" : `${pop.kind}:${pop.key}`}
          pop={pop}
          app={preview}
          side={side}
          root={rootRef}
          onClose={() => setPop(null)}
          onEnter={() => clearTimer("close")}
          onLeave={() => {
            if (popRef.current?.kind === "preview") closePreviewSoon();
          }}
          onError={flash}
          onPlaced={report}
        />
      )}
      {tip && !drag && (
        <div ref={tipRef} className="td-tip" role="tooltip">
          {tip.text}
        </div>
      )}
      {error && <div className="td-error">{t(error)}</div>}
    </div>
  );
}
