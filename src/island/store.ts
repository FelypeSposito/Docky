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
  overlay: Overlay | null;
  page: string;
  expand: () => void;
  collapse: () => void;
  toggleLarge: () => void;
  togglePin: () => void;
  setPage: (id: string) => void;
  showOverlay: (overlay: Overlay, durationMs: number) => void;
}

let overlayTimer: ReturnType<typeof setTimeout> | undefined;

export const useIslandStore = create<IslandStore>((set) => ({
  expanded: false,
  pinned: false,
  large: false,
  overlay: null,
  page: "music",

  expand: () => set({ expanded: true }),
  collapse: () => set({ expanded: false, pinned: false, large: false }),
  toggleLarge: () => set((s) => ({ large: !s.large, pinned: s.large ? s.pinned : true })), // ao ampliar, fica aberta
  togglePin: () => set((s) => ({ pinned: !s.pinned, expanded: !s.pinned ? true : s.expanded })),
  setPage: (page) => set({ page }),

  showOverlay: (overlay, durationMs) => {
    if (!noticeEnabled(overlay, useConfigStore.getState().config)) return;
    clearTimeout(overlayTimer);
    set({ overlay });
    overlayTimer = setTimeout(() => set({ overlay: null }), durationMs);
  },
}));
