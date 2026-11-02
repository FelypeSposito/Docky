import { useEffect } from "react";
import { ipc } from "../lib/ipc";
import { useConfigStore } from "../config/useConfig";
import { neighbor } from "./navigation";
import { visiblePages } from "./pageOrder";
import { PAGES } from "./pages/registry";
import { useIslandStore } from "./store";

/** Ids das páginas na ordem que o usuário escolheu. */
const pageIds = () => {
  const { pageOrder, hiddenPages } = useConfigStore.getState().config;
  return visiblePages(PAGES, pageOrder, hiddenPages).map((p) => p.id);
};

/** Teclas globais (Ctrl+Alt+D, ←, →, N): o Rust avisa e a ilha decide o que fazer. */
export function useHotkeys(): void {
  useEffect(
    () =>
      ipc.onHotkey((key) => {
        const island = useIslandStore.getState();
        switch (key) {
          case "toggle":
            if (island.expanded && island.pinned) island.collapse();
            else useIslandStore.setState({ expanded: true, pinned: true });
            break;
          case "next":
          case "previous":
            useIslandStore.setState({ expanded: true, pinned: true, page: neighbor(pageIds(), island.page, key === "next" ? 1 : -1) });
            break;
          case "notes":
            useIslandStore.setState({ expanded: true, pinned: true, page: "note" });
            // A página de notas ainda pode estar entrando na tela; espera um instante para focar o campo.
            setTimeout(() => document.querySelector<HTMLInputElement>(".nin input")?.focus(), 250);
            break;
        }
      }),
    [],
  );
}
