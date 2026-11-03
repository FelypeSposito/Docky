import { useLayoutEffect, useRef, useState } from "react";
import { moveItem } from "./pageOrder";

/** Quanto o mouse precisa andar, com o botão apertado, para virar um arrasto (abaixo disso ainda é um clique). */
const START_PX = 6;
/** A faixa, junto da borda de cima e de baixo da lista, em que arrastar rola a lista. */
const EDGE_PX = 26;

interface Drag {
  id: string;
  /** Onde, dentro do ícone, o mouse o segurou (ele não "pula" para o cursor). */
  offX: number;
  offY: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  active: boolean;
}

/**
 * Grade que se reordena arrastando, como a tela inicial do celular: o ícone segue o mouse, os outros deslizam para
 * abrir espaço e o resultado só vale ao soltar. Um clique sem arrastar continua sendo clique.
 *
 * Os ícones ficam sempre na mesma ordem no DOM e a posição vem do `order` do CSS (mover o elemento arrastado no DOM
 * faria o navegador cancelar o arrasto). O container precisa ser `position: relative`: as posições são medidas nele.
 * Mais de uma lista pode dividir o mesmo container; cada uma só troca lugar com os seus.
 *
 * `ids` é a ordem atual; `onCommit` recebe a nova ordem quando o usuário solta.
 */
export function useGridSort(ids: string[], onCommit: (next: string[]) => void, enabled = true) {
  const [draft, setDraft] = useState<string[] | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const tiles = useRef(new Map<string, HTMLElement>());
  const drag = useRef<Drag | null>(null);
  const before = useRef<Map<string, DOMRect> | null>(null);
  const live = useRef({ ids, draft, onCommit });
  live.current = { ids, draft, onCommit };

  const current = draft ?? ids;
  const position = new Map(current.map((id, index) => [id, index]));

  // Os ouvintes da janela precisam ser sempre as mesmas funções (para o removeEventListener achar), então
  // nascem uma vez e só usam refs e setters, que não mudam entre renderizações.
  const handlers = useRef<ReturnType<typeof create> | null>(null);
  function create() {
    /** O ponto do mouse em coordenadas do container (que rola), e o próprio container. */
    const inParent = (el: HTMLElement, x: number, y: number) => {
      const parent = el.offsetParent as HTMLElement | null;
      if (!parent) return null;
      const box = parent.getBoundingClientRect();
      return { parent, px: x - box.left - parent.clientLeft + parent.scrollLeft, py: y - box.top - parent.clientTop + parent.scrollTop };
    };

    /** Põe o ícone arrastado debaixo do cursor. */
    const follow = () => {
      const d = drag.current;
      const el = d && tiles.current.get(d.id);
      if (!d || !el || !d.active) return;
      const at = inParent(el, d.x, d.y);
      if (!at) return;
      el.style.transform = `translate(${at.px - d.offX - el.offsetLeft}px, ${at.py - d.offY - el.offsetTop}px) scale(1.06)`;
    };

    /** Engole o clique que o navegador manda ao soltar um arrasto (senão soltar um app abriria o app). */
    const swallowClick = () => {
      const eat = (e: Event) => {
        e.stopPropagation();
        e.preventDefault();
      };
      window.addEventListener("click", eat, { capture: true, once: true });
      setTimeout(() => window.removeEventListener("click", eat, { capture: true }), 80);
    };

    const stop = (commit: boolean) => {
      const d = drag.current;
      if (!d) return;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      const el = tiles.current.get(d.id);
      if (el) el.style.transform = "";
      const { draft: finalOrder, ids: startOrder, onCommit: commitOrder } = live.current;
      if (d.active) {
        swallowClick();
        if (commit && finalOrder && finalOrder.some((id, i) => id !== startOrder[i])) commitOrder(finalOrder);
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
      d.x = e.clientX;
      d.y = e.clientY;
      if (!d.active) {
        if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < START_PX) return;
        d.active = true;
        setDragId(d.id);
        setDraft(live.current.ids);
      }
      const el = tiles.current.get(d.id);
      if (!el) return;
      const at = inParent(el, d.x, d.y);
      if (!at) return;

      // Perto da borda de cima ou de baixo, a lista rola para dar para levar o ícone mais longe.
      const box = at.parent.getBoundingClientRect();
      if (d.y < box.top + EDGE_PX) at.parent.scrollTop -= 10;
      else if (d.y > box.bottom - EDGE_PX) at.parent.scrollTop += 10;
      follow();

      // O ícone vai para o lugar do ícone (da mesma lista) que está debaixo do cursor.
      const order = live.current.draft ?? live.current.ids;
      const from = order.indexOf(d.id);
      const to = order.findIndex((id) => {
        const r = tiles.current.get(id);
        return r ? at.px >= r.offsetLeft && at.px < r.offsetLeft + r.offsetWidth && at.py >= r.offsetTop && at.py < r.offsetTop + r.offsetHeight : false;
      });
      if (to >= 0 && to !== from) {
        before.current = new Map(order.flatMap((id) => (tiles.current.get(id) ? [[id, tiles.current.get(id)!.getBoundingClientRect()] as const] : [])));
        setDraft(moveItem(order, from, to));
      }
    };

    const down = (e: React.PointerEvent<HTMLElement>, id: string) => {
      if (e.button !== 0 || !enabledRef.current) return;
      const el = tiles.current.get(id);
      const at = el && inParent(el, e.clientX, e.clientY);
      if (!el || !at) return;
      drag.current = { id, offX: at.px - el.offsetLeft, offY: at.py - el.offsetTop, startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY, active: false };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", cancel);
    };

    return { follow, down };
  }
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  handlers.current ??= create();
  const { follow, down } = handlers.current;

  // Depois de reordenar: os outros ícones deslizam até o lugar novo e o arrastado continua no cursor.
  useLayoutEffect(() => {
    const previous = before.current;
    before.current = null;
    if (previous) {
      for (const [id, rect] of previous) {
        const el = tiles.current.get(id);
        if (!el || id === drag.current?.id) continue;
        const now = el.getBoundingClientRect();
        const dx = rect.left - now.left;
        const dy = rect.top - now.top;
        if (dx || dy) el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: 260, easing: "cubic-bezier(.22,1,.36,1)" });
      }
    }
    follow();
  }, [draft, follow]);

  return {
    /** Posição visual de cada id (use em `style={{ order }}`). */
    position,
    dragId,
    /** Registra o elemento do ícone. */
    tileRef: (id: string) => (el: HTMLElement | null) => {
      if (el) tiles.current.set(id, el);
      else tiles.current.delete(id);
    },
    /** Use no `onPointerDown` do ícone. */
    down,
  };
}
