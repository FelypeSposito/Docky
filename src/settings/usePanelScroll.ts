import { useEffect, useRef } from "react";

/** Um respiro entre o topo da área rolável e o painel. */
const GAP = 8;

/**
 * Painéis que abrem acima de uma lista (o seletor de ícone, os itens de um grupo, as sugestões) ficam fora da tela
 * quando a pessoa está lá embaixo na lista, e parece que o clique não fez nada. Este hook leva a área de rolagem até o
 * painel quando `key` muda para um valor, e de volta para onde a pessoa estava quando o painel fecha (`key` = null).
 *
 * Use o `ref` devolvido num elemento que contenha o painel (ele existe mesmo com o painel fechado).
 */
export function usePanelScroll(key: string | null) {
  const ref = useRef<HTMLDivElement>(null);
  const before = useRef<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    const scroller = el?.closest<HTMLElement>(".sa-main");
    if (!el || !scroller) return;
    if (key !== null) {
      before.current ??= scroller.scrollTop;
      // `scrollIntoView` rolaria também o contêiner da janela (e empurraria o cabeçalho para fora): só a área rolável.
      const top = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - GAP;
      scroller.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    } else if (before.current !== null) {
      scroller.scrollTo({ top: before.current, behavior: "smooth" });
      before.current = null;
    }
  }, [key]);

  return ref;
}
