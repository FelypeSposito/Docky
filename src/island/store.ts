import { create } from "zustand";
import { useConfigStore } from "../config/useConfig";
import type { Overlay } from "./modes";
import { noticeEnabled } from "./notices";

interface IslandStore {
  expanded: boolean;
  /** Fixada por clique: não recolhe quando o mouse sai. */
  pinned: boolean;
  /** Mostra a versão maior da página atual (só vale para páginas que têm uma). */
  large: boolean;
  /** Na tela expandida, mostra os ajustes da página no lugar do conteúdo. */
  quick: boolean;
  overlay: Overlay | null;
  page: string;
  /** O que está digitado na busca do cabeçalho (página Atalhos). Limpa quando a ilha recolhe. */
  launcherQuery: string;
  /** Sobe a cada Enter na busca: a página Atalhos abre o primeiro resultado. */
  launcherEnter: number;
  setLauncherQuery: (query: string) => void;
  submitLauncher: () => void;
  expand: () => void;
  collapse: () => void;
  toggleLarge: () => void;
  toggleQuick: () => void;
  togglePin: () => void;
  setPage: (id: string) => void;
  showOverlay: (overlay: Overlay, durationMs: number) => void;
}

let overlayTimer: ReturnType<typeof setTimeout> | undefined;

export const useIslandStore = create<IslandStore>((set) => ({
  expanded: false,
  pinned: false,
  large: false,
  quick: false,
  overlay: null,
  page: "music",
  launcherQuery: "",
  launcherEnter: 0,
  setLauncherQuery: (launcherQuery) => set({ launcherQuery }),
  submitLauncher: () => set((s) => ({ launcherEnter: s.launcherEnter + 1 })),

  expand: () => set({ expanded: true }),
  collapse: () => set({ expanded: false, pinned: false, large: false, quick: false, launcherQuery: "" }),
  toggleLarge: () => set((s) => ({ large: !s.large, quick: false, pinned: s.large ? s.pinned : true })), // ao ampliar, fica aberta
  toggleQuick: () => set((s) => ({ quick: !s.quick })),
  togglePin: () => set((s) => ({ pinned: !s.pinned, expanded: !s.pinned ? true : s.expanded })),
  setPage: (page) => set({ page, launcherQuery: "" }),

  showOverlay: (overlay, durationMs) => {
    if (!noticeEnabled(overlay, useConfigStore.getState().config)) return;
    clearTimeout(overlayTimer);
    set({ overlay });
    overlayTimer = setTimeout(() => set({ overlay: null }), durationMs);
  },
}));
