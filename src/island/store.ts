import { create } from "zustand";
import type { Overlay } from "./modes";

interface IslandStore {
  expanded: boolean;
  /** Fixada por clique: não recolhe quando o mouse sai. */
  pinned: boolean;
  overlay: Overlay | null;
  page: string;
  expand: () => void;
  collapse: () => void;
  togglePin: () => void;
  setPage: (id: string) => void;
  showOverlay: (overlay: Overlay, durationMs: number) => void;
}

let overlayTimer: ReturnType<typeof setTimeout> | undefined;

export const useIslandStore = create<IslandStore>((set) => ({
  expanded: false,
  pinned: false,
  overlay: null,
  page: "music",

  expand: () => set({ expanded: true }),
  collapse: () => set({ expanded: false, pinned: false }),
  togglePin: () => set((s) => ({ pinned: !s.pinned, expanded: !s.pinned ? true : s.expanded })),
  setPage: (page) => set({ page }),

  showOverlay: (overlay, durationMs) => {
    clearTimeout(overlayTimer);
    set({ overlay });
    overlayTimer = setTimeout(() => set({ overlay: null }), durationMs);
  },
}));
