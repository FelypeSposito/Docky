import { create } from "zustand";
import { ipc } from "../lib/ipc";
import { useIslandStore } from "../island/store";

interface ShelfStore {
  /** Arquivos soltos na ilha que ainda esperam um destino. */
  paths: string[];
  dragging: boolean;
  setDragging: (dragging: boolean) => void;
  add: (paths: string[]) => void;
  clear: () => void;
}

export const useShelfStore = create<ShelfStore>((set) => ({
  paths: [],
  dragging: false,
  setDragging: (dragging) => set({ dragging }),
  add: (paths) => set((s) => ({ paths: [...new Set([...s.paths, ...paths])], dragging: false })),
  clear: () => set({ paths: [] }),
}));

/** Abre a Shelf na ilha quando você arrasta arquivos para ela, e guarda o que for solto. */
export function startShelfSync(): () => void {
  const openShelf = () => {
    const island = useIslandStore.getState();
    island.expand();
    island.setPage("tray");
  };
  return ipc.onFileDrop((event) => {
    const shelf = useShelfStore.getState();
    if (event.type === "enter") {
      shelf.setDragging(true);
      openShelf();
    } else if (event.type === "leave") {
      shelf.setDragging(false);
    } else {
      shelf.add(event.paths);
      openShelf();
      useIslandStore.setState({ pinned: true }); // fica aberta até você escolher o destino
    }
  });
}

export const fileName = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() ?? path;
