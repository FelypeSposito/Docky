import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useConfigStore } from "../config/useConfig";
import { ipc } from "../lib/ipc";
import { EyeIcon, EyeOffIcon, GearIcon } from "./icons";
import { mergeOrder, moveItem, orderPages, visiblePages } from "./pageOrder";
import { PAGES } from "./pages/registry";
import { t } from "../i18n";

interface DockProps {
  page: string;
  onPage: (id: string) => void;
}

/** Holding the button this long lifts the page, ready to move (without moving yet). */
const HOLD_MS = 280;
/** Moving this far along the dock with the button down starts a drag at once: press and drag, no hold needed. */
const START_PX = 6;

interface Drag {
  id: string;
  /** Distância do clique até a borda esquerda do botão, para ele não "pular" para o cursor. */
  grab: number;
  startX: number;
  pointer: number;
  active: boolean;
  timer?: ReturnType<typeof setTimeout>;
}

/**
 * O dock: aperte uma página e arraste (ou segure um instante) para trocar a ordem. Um clique só troca de página. A
 * ordem fica salva nas configurações.
 *
 * Os botões ficam sempre na mesma ordem no DOM e a posição visual vem do `order` do CSS. Se o React movesse o
 * botão arrastado no DOM, o navegador soltaria o "pointer capture" no meio do arrasto e ele travaria.
 */
export function Dock({ page, onPage }: DockProps) {
  const savedOrder = useConfigStore((s) => s.config.pageOrder);
  const hidden = useConfigStore((s) => s.config.hiddenPages);
  const update = useConfigStore((s) => s.update);

  const [draft, setDraft] = useState<string[] | null>(null);
  /** The right-click menu: hide this page, show a hidden one back, or its settings, all without leaving the island. */
  const [menu, setMenu] = useState<{ page: string | null; left: number } | null>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      if (e instanceof PointerEvent && (e.target as HTMLElement).closest(".dock-menu")) return;
      setMenu(null);
    };
    window.addEventListener("pointerdown", close, true);
    window.addEventListener("keydown", close, true);
    return () => {
      window.removeEventListener("pointerdown", close, true);
      window.removeEventListener("keydown", close, true);
    };
  }, [menu]);
  const openMenu = (e: React.MouseEvent, pageId: string | null) => {
    e.preventDefault();
    const dock = dockRef.current?.getBoundingClientRect();
    const at = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenu({ page: pageId, left: dock ? at.left - dock.left + at.width / 2 : 0 });
  };
  const setHidden = (pageId: string, hide: boolean) => {
    const current = useConfigStore.getState().config.hiddenPages;
    update({ hiddenPages: hide ? [...current.filter((p) => p !== pageId), pageId] : current.filter((p) => p !== pageId) });
    setMenu(null);
  };
  const [dragId, setDragId] = useState<string | null>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const drag = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  const before = useRef<Map<string, number> | null>(null);
  /** Sempre o estado mais recente, para os ouvintes da janela não usarem valores velhos. */
  const live = useRef({ ids: [] as string[], draft: null as string[] | null, full: [] as string[] });

  const shown = visiblePages(PAGES, savedOrder, hidden);
  const shownIds = new Set(shown.map((p) => p.id));
  const ids = draft ?? shown.map((p) => p.id);
  live.current = { ids, draft, full: orderPages(PAGES, savedOrder).map((p) => p.id) };
  const position = new Map(ids.map((id, index) => [id, index]));

  // Os ouvintes da janela precisam ser sempre as mesmas funções (para o removeEventListener achar), então
  // nascem uma vez e só usam refs e setters, que não mudam entre renderizações.
  const handlers = useRef<ReturnType<typeof createHandlers> | null>(null);
  function createHandlers() {
    /** Põe o botão arrastado debaixo do cursor e devolve a borda esquerda dele na tela. */
    const follow = (): number | null => {
      const d = drag.current;
      const el = d && buttons.current.get(d.id);
      if (!d || !el || !d.active || !dockRef.current) return null;
      const want = d.pointer - d.grab;
      const layoutLeft = dockRef.current.getBoundingClientRect().left + el.offsetLeft;
      el.style.transform = `translateX(${want - layoutLeft}px) scale(1.08)`;
      return want;
    };

    const stop = (commit: boolean) => {
      const d = drag.current;
      if (!d) return;
      clearTimeout(d.timer);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      if (d.active) {
        suppressClick.current = true; // o clique que o navegador gera ao soltar não deve trocar de página
        setTimeout(() => (suppressClick.current = false), 120);
        const el = buttons.current.get(d.id);
        if (el) el.style.transform = "";
        const finalOrder = live.current.draft;
        // As páginas escondidas não aparecem no dock, mas guardam o lugar delas na ordem.
        if (commit && finalOrder) update({ pageOrder: mergeOrder(live.current.full, finalOrder) });
      }
      drag.current = null;
      setDragId(null);
      setDraft(null);
    };

    const up = () => stop(true);
    const cancel = () => stop(false);
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      d.pointer = e.clientX;
      if (!d.active) {
        if (Math.abs(e.clientX - d.startX) < START_PX) return; // still a click
        clearTimeout(d.timer);
        d.active = true;
        setDragId(d.id);
        setDraft(live.current.ids);
      }
      const want = follow();
      const el = buttons.current.get(d.id);
      if (want === null || !el || !dockRef.current) return;

      // A nova posição é quantos dos outros botões ficam à esquerda do centro do arrastado.
      const current = live.current.ids;
      const dockLeft = dockRef.current.getBoundingClientRect().left;
      const center = want + el.offsetWidth / 2;
      const from = current.indexOf(d.id);
      const to = current
        .filter((other) => other !== d.id)
        .filter((other) => {
          const b = buttons.current.get(other);
          return b ? dockLeft + b.offsetLeft + b.offsetWidth / 2 < center : false;
        }).length;
      if (to !== from) {
        before.current = new Map(
          current.flatMap((id) => {
            const b = buttons.current.get(id);
            return b ? [[id, b.getBoundingClientRect().left] as const] : [];
          }),
        );
        setDraft(moveItem(current, from, to));
      }
    };

    const down = (e: React.PointerEvent<HTMLButtonElement>, id: string) => {
      if (e.button !== 0) return;
      const el = e.currentTarget;
      const d: Drag = { id, grab: e.clientX - el.getBoundingClientRect().left, startX: e.clientX, pointer: e.clientX, active: false };
      d.timer = setTimeout(() => {
        d.active = true;
        setDragId(id);
        setDraft(live.current.ids);
      }, HOLD_MS);
      drag.current = d;
      // Ouvintes na janela: o arrasto continua mesmo que o cursor saia do botão.
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", cancel);
    };

    return { follow, down };
  }
  handlers.current ??= createHandlers();
  const { follow, down } = handlers.current;

  // Depois de reordenar: os outros botões deslizam até o lugar novo e o arrastado continua no cursor.
  useLayoutEffect(() => {
    const previous = before.current;
    before.current = null;
    if (previous) {
      for (const [id, left] of previous) {
        const el = buttons.current.get(id);
        if (!el || id === drag.current?.id) continue;
        const dx = left - el.getBoundingClientRect().left;
        if (dx) el.animate([{ transform: `translateX(${dx}px)` }, { transform: "none" }], { duration: 320, easing: "cubic-bezier(.22,1,.36,1)" });
      }
    }
    follow();
  }, [draft, follow]);

  return (
    <div ref={dockRef} className={`dock${dragId ? " dragging" : ""}`}>
      {PAGES.filter((p) => shownIds.has(p.id)).map(({ id, label, Icon }) => (
        <button
          key={id}
          ref={(el) => {
            if (el) buttons.current.set(id, el);
            else buttons.current.delete(id);
          }}
          className={`dk${id === page ? " on" : ""}${id === dragId ? " drag" : ""}`}
          style={{ order: position.get(id) }}
          aria-label={t(label)}
          title={t("Arraste para mudar a ordem · botão direito para ocultar")}
          onPointerDown={(e) => down(e, id)}
          onClick={() => {
            if (!suppressClick.current) onPage(id);
          }}
          onContextMenu={(e) => openMenu(e, id)}
        >
          <Icon size={16} />
          <span className="lb">{t(label)}</span>
        </button>
      ))}
      <i className="dsep" style={{ order: PAGES.length }} />
      <button
        className="dk"
        style={{ order: PAGES.length + 1 }}
        aria-label={t("Configurações")}
        onClick={() => ipc.openSettings(PAGES.find((p) => p.id === page)?.area)}
        onContextMenu={(e) => openMenu(e, null)}
        title={t("Configurações desta página")}
      >
        <GearIcon />
      </button>
      {menu && (
        <div className="dock-menu" role="menu" style={{ left: menu.left }}>
          {menu.page && (
            <button role="menuitem" disabled={shown.length <= 1} onClick={() => setHidden(menu.page!, true)}>
              <EyeOffIcon size={13} />
              {t("Ocultar {page}", { page: t(PAGES.find((p) => p.id === menu.page)?.label ?? "") })}
            </button>
          )}
          {PAGES.filter((p) => hidden.includes(p.id)).map((p) => (
            <button key={p.id} role="menuitem" onClick={() => setHidden(p.id, false)}>
              <EyeIcon size={13} />
              {t("Mostrar {page}", { page: t(p.label) })}
            </button>
          ))}
          <button
            role="menuitem"
            onClick={() => {
              setMenu(null);
              ipc.openSettings(PAGES.find((p) => p.id === (menu.page ?? page))?.area);
            }}
          >
            <GearIcon />
            {t("Configurações")}
          </button>
        </div>
      )}
    </div>
  );
}
