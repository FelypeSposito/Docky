import { useEffect, useLayoutEffect, useRef } from "react";
import { t } from "../i18n";
import { type DockApp, ipc } from "../lib/ipc";
import { AppIcon, CloseIcon, DesktopIcon, FolderIcon, GaugeIcon, GearIcon, NewWindowIcon, PinIcon } from "./icons";

export type Side = "bottom" | "left" | "right";

/** What opens next to the dock: an app's window previews (hover), an app's menu or the dock's own (right click). */
export type Pop = { kind: "preview" | "menu"; key: string } | { kind: "dock"; x: number; y: number };

/** More windows than this and the previews become a list of titles (the previews would not fit the edge). */
const MAX_SHOTS = { bottom: 6, side: 4 };

/**
 * Puts a panel next to `anchor`, on the open side of the screen: above the dock at the bottom, beside it on the left
 * or right, centred on the anchor and kept on screen. `edge` is the dock's rect when the anchor is on the dock.
 */
export function placeNear(el: HTMLElement, anchor: DOMRect, edge: DOMRect, side: Side, gap: number) {
  const clamp = (value: number, size: number, room: number) => Math.min(room - size - 8, Math.max(8, value));
  if (side === "bottom") {
    el.style.left = `${clamp(anchor.left + anchor.width / 2 - el.offsetWidth / 2, el.offsetWidth, window.innerWidth)}px`;
    el.style.top = `${edge.top - el.offsetHeight - gap}px`;
  } else {
    el.style.top = `${clamp(anchor.top + anchor.height / 2 - el.offsetHeight / 2, el.offsetHeight, window.innerHeight)}px`;
    el.style.left = side === "left" ? `${edge.right + gap}px` : `${edge.left - el.offsetWidth - gap}px`;
  }
}

export function DockPopover({
  pop,
  app,
  side,
  root,
  onClose,
  onEnter,
  onLeave,
  onError,
  onPlaced,
}: {
  pop: Pop;
  app: DockApp | null;
  side: Side;
  root: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onEnter: () => void;
  onLeave: () => void;
  onError: (message: string) => void;
  onPlaced: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const max = side === "bottom" ? MAX_SHOTS.bottom : MAX_SHOTS.side;
  const shots = pop.kind === "preview" && app ? (app.windows.length <= max ? app.windows : null) : null;
  /** The previews are drawn once the panel has faded in; after that they follow it when it moves. */
  const ready = useRef(false);
  const sent = useRef("");
  const sendSlots = () => {
    const slots = Array.from(ref.current?.querySelectorAll<HTMLElement>(".td-shot-img") ?? []).map((el) => {
      const r = el.getBoundingClientRect();
      return { id: Number(el.dataset.id), x: r.left + 4, y: r.top + 4, w: r.width - 8, h: r.height - 8 };
    });
    const signature = JSON.stringify(slots);
    if (signature === sent.current) return;
    sent.current = signature;
    ipc.dockPreviews(slots);
  };

  // Sits next to its app's button (or where the dock was right-clicked), on the open side of the screen.
  useLayoutEffect(() => {
    const el = ref.current;
    const dock = root.current?.querySelector<HTMLElement>(".td");
    if (!el || !dock) return;
    const button = app ? root.current?.querySelector<HTMLElement>(`.td-app[data-key="${CSS.escape(app.key)}"]`) : null;
    const anchor = pop.kind === "dock" ? new DOMRect(pop.x, pop.y, 0, 0) : button?.getBoundingClientRect();
    if (!anchor) return;
    placeNear(el, anchor, dock.getBoundingClientRect(), side, 10);
    onPlaced();
    if (ready.current) sendSlots();
  });

  // Windows draws the live previews into the frames, a beat after the panel shows (it fades in, the previews do not).
  useEffect(() => {
    const timer = window.setTimeout(() => {
      ready.current = true;
      sendSlots();
    }, 110);
    return () => {
      window.clearTimeout(timer);
      ipc.dockPreviews([]);
    };
  }, []);

  const act = (action: () => Promise<void> | void) => () => {
    onClose();
    void Promise.resolve(action()).catch((e) => onError(e instanceof Error ? e.message : String(e)));
  };

  const shell = app?.path.toLowerCase().startsWith("shell:") ?? false;

  return (
    <div
      ref={ref}
      className={`td-pop ${pop.kind}${shots ? " shots" : ""}${side === "bottom" ? "" : " col"}`}
      role={pop.kind === "preview" ? "group" : "menu"}
      aria-label={app?.name ?? t("Dock")}
      onPointerEnter={onEnter}
      onPointerLeave={onLeave}
    >
      {pop.kind === "preview" && app && shots && (
        <div className="td-shots">
          {shots.map((w) => (
            <div key={w.id} className={`td-shot${w.minimized ? " min" : ""}`}>
              <div className="td-shot-h">
                <AppIcon app={app} size={14} />
                <span className="td-shot-t">{w.title}</span>
                <button className="td-x" aria-label={t("Fechar esta janela")} onClick={() => ipc.dockCloseWindow(w.id)}>
                  <CloseIcon size={12} />
                </button>
              </div>
              <button
                className="td-shot-img"
                data-id={w.id}
                aria-label={w.title}
                onClick={act(() => ipc.dockFocusWindow(w.id))}
                onAuxClick={(e) => {
                  // Middle click closes the window, like on Windows' previews.
                  if (e.button === 1) ipc.dockCloseWindow(w.id);
                }}
              >
                <AppIcon app={app} size={34} />
              </button>
            </div>
          ))}
        </div>
      )}

      {pop.kind === "preview" && app && !shots && (
        <>
          <b className="td-pop-h">
            {app.name}
            <em>{app.windows.length}</em>
          </b>
          {app.windows.map((w) => (
            <div key={w.id} className={`td-win${w.minimized ? " min" : ""}`}>
              <button className="td-win-t" onClick={act(() => ipc.dockFocusWindow(w.id))}>
                {w.title}
              </button>
              <button className="td-x" aria-label={t("Fechar esta janela")} onClick={() => ipc.dockCloseWindow(w.id)}>
                <CloseIcon size={12} />
              </button>
            </div>
          ))}
        </>
      )}

      {pop.kind === "menu" && app && (
        <>
          <div className="td-pop-app">
            <AppIcon app={app} size={20} />
            <b>{app.name}</b>
          </div>
          {app.path && (
            <button className="td-act" role="menuitem" onClick={act(() => ipc.dockLaunch(app.path))}>
              <NewWindowIcon />
              {t("Nova janela")}
            </button>
          )}
          {app.path && !shell && (
            <button className="td-act" role="menuitem" onClick={act(() => ipc.dockReveal(app.path))}>
              <FolderIcon />
              {t("Abrir local do arquivo")}
            </button>
          )}
          {app.path && (
            <button className="td-act" role="menuitem" onClick={act(() => ipc.dockPin(app.path, !app.pinned))}>
              <PinIcon off={app.pinned} />
              {t(app.pinned ? "Tirar do dock" : "Fixar no dock")}
            </button>
          )}
          {app.windows.length > 0 && (
            <button className="td-act danger" role="menuitem" onClick={act(() => app.windows.forEach((w) => ipc.dockCloseWindow(w.id)))}>
              <CloseIcon />
              {t(app.windows.length > 1 ? "Fechar todas as janelas" : "Fechar a janela")}
            </button>
          )}
        </>
      )}

      {pop.kind === "dock" && (
        <>
          <button className="td-act" role="menuitem" onClick={act(() => ipc.dockShortcut("taskManager"))}>
            <GaugeIcon />
            {t("Gerenciador de Tarefas")}
          </button>
          <button className="td-act" role="menuitem" onClick={act(() => ipc.dockShortcut("desktop"))}>
            <DesktopIcon />
            {t("Mostrar a área de trabalho")}
          </button>
          <button className="td-act" role="menuitem" onClick={act(() => ipc.openSettings("dock"))}>
            <GearIcon />
            {t("Configurações do dock")}
          </button>
        </>
      )}
    </div>
  );
}
