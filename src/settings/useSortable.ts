import { useLayoutEffect, useRef, useState } from "react";
import { moveItem } from "../island/pageOrder";

/** Quanto o mouse precisa andar, segurando a alça, para começar a arrastar (evita arrastar sem querer ao clicar). */
const START_PX = 3;

interface Drag {
  id: string;
  /** Distância do clique até o topo da linha, para ela não "pular" para o cursor. */
  grab: number;
  startY: number;
  pointer: number;
  active: boolean;
}

/**
 * Lista vertical que se reordena arrastando, no mesmo estilo do dock da ilha: a linha segue o mouse, as outras
 * deslizam para abrir espaço e o resultado só vale ao soltar.
 *
 * As linhas ficam sempre na mesma ordem no DOM e a posição visual vem do `order` do CSS (o container precisa ser
 * `display: flex; flex-direction: column; position: relative`). Mover o elemento arrastado no DOM faria o
 * navegador cancelar o arrasto.
 *
 * `ids` é a ordem atual; `onCommit` recebe a nova ordem quando o usuário solta.
 */
export function useSortable(ids: string[], onCommit: (next: string[]) => void) {
  const [draft, setDraft] = useState<string[] | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const rows = useRef(new Map<string, HTMLElement>());
  const drag = useRef<Drag | null>(null);
  const before = useRef<Map<string, number> | null>(null);
  const live = useRef({ ids, draft, onCommit });
  live.current = { ids, draft, onCommit };

  const current = draft ?? ids;
  const position = new Map(current.map((id, index) => [id, index]));

  // Os ouvintes da janela precisam ser sempre as mesmas funções (para o removeEventListener achar), então
  // nascem uma vez e só usam refs e setters, que não mudam entre renderizações.
  const handlers = useRef<ReturnType<typeof create> | null>(null);
  function create() {
    /** Põe a linha arrastada debaixo do cursor e devolve a borda de cima dela na tela. */
    const follow = (): number | null => {
      const d = drag.current;
      const el = d && rows.current.get(d.id);
      if (!d || !el || !d.active || !el.parentElement) return null;
      const want = d.pointer - d.grab;
      const layoutTop = el.parentElement.getBoundingClientRect().top + el.offsetTop;
      el.style.transform = `translateY(${want - layoutTop}px) scale(1.015)`;
      return want;
    };

    const stop = (commit: boolean) => {
      const d = drag.current;
      if (!d) return;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      const el = rows.current.get(d.id);
      if (el) el.style.transform = "";
      const { draft: finalOrder, onCommit: commitOrder } = live.current;
      if (d.active && commit && finalOrder) commitOrder(finalOrder);
      drag.current = null;
      setDragId(null);
      setDraft(null);
    };

    const up = () => stop(true);
    const cancel = () => stop(false);
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      d.pointer = e.clientY;
      if (!d.active) {
        if (Math.abs(e.clientY - d.startY) < START_PX) return;
        d.active = true;
        setDragId(d.id);
        setDraft(live.current.ids);
      }
      const want = follow();
      const el = rows.current.get(d.id);
      if (want === null || !el || !el.parentElement) return;

      // A nova posição é quantas das outras linhas ficam acima do centro da arrastada.
      const order = live.current.draft ?? live.current.ids;
      const parentTop = el.parentElement.getBoundingClientRect().top;
      const center = want + el.offsetHeight / 2;
      const from = order.indexOf(d.id);
      const to = order
        .filter((other) => other !== d.id)
        .filter((other) => {
          const r = rows.current.get(other);
          return r ? parentTop + r.offsetTop + r.offsetHeight / 2 < center : false;
        }).length;
      if (to !== from) {
        before.current = new Map(
          order.flatMap((id) => {
            const r = rows.current.get(id);
            return r ? [[id, r.getBoundingClientRect().top] as const] : [];
          }),
        );
        setDraft(moveItem(order, from, to));
      }
    };

    const down = (e: React.PointerEvent<HTMLElement>, id: string) => {
      if (e.button !== 0) return;
      e.preventDefault(); // não seleciona texto enquanto arrasta
      const row = rows.current.get(id);
      if (!row) return;
      drag.current = { id, grab: e.clientY - row.getBoundingClientRect().top, startY: e.clientY, pointer: e.clientY, active: false };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", cancel);
    };

    return { follow, down };
  }
  handlers.current ??= create();
  const { follow, down } = handlers.current;

  // Depois de reordenar: as outras linhas deslizam até o lugar novo e a arrastada continua no cursor.
  useLayoutEffect(() => {
    const previous = before.current;
    before.current = null;
    if (previous) {
      for (const [id, top] of previous) {
        const el = rows.current.get(id);
        if (!el || id === drag.current?.id) continue;
        const dy = top - el.getBoundingClientRect().top;
        if (dy) el.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], { duration: 300, easing: "cubic-bezier(.22,1,.36,1)" });
      }
    }
    follow();
  }, [draft, follow]);

  return {
    /** Posição visual de cada id (use em `style={{ order }}`). */
    position,
    dragId,
    /** Registra o elemento da linha. */
    rowRef: (id: string) => (el: HTMLElement | null) => {
      if (el) rows.current.set(id, el);
      else rows.current.delete(id);
    },
    /** Use no `onPointerDown` da alça da linha. */
    down,
  };
}
