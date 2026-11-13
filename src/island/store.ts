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
  /** O mouse está sobre a pílula recolhida (com "abrir ao passar o mouse" desligado): mostra o player ou o resumo. */
  peek: boolean;
  setPeek: (peek: boolean) => void;
  page: string;
  /** O lugar no cabeçalho da ilha aberta onde a página põe o campo dela (a busca, a nota rápida). */
  headerSlot: HTMLElement | null;
  setHeaderSlot: (el: HTMLElement | null) => void;
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
  peek: false,
  setPeek: (peek) => set((s) => (s.peek === peek ? s : { peek })),
  page: "music",
  headerSlot: null,
  setHeaderSlot: (headerSlot) => set((s) => (s.headerSlot === headerSlot ? s : { headerSlot })),

  expand: () => set({ expanded: true, peek: false }),
  collapse: () => set({ expanded: false, pinned: false, large: false, quick: false, peek: false }),
  toggleLarge: () => set((s) => ({ large: !s.large, quick: false, pinned: s.large ? s.pinned : true })), // ao ampliar, fica aberta
  toggleQuick: () => set((s) => ({ quick: !s.quick })),
  togglePin: () => set((s) => ({ pinned: !s.pinned, expanded: !s.pinned ? true : s.expanded, peek: false })),
  setPage: (page) => set({ page }),

  showOverlay: (overlay, durationMs) => {
    if (!noticeEnabled(overlay, useConfigStore.getState().config)) return;
    clearTimeout(overlayTimer);
    set({ overlay });
    overlayTimer = setTimeout(() => set({ overlay: null }), durationMs);
  },
}));
