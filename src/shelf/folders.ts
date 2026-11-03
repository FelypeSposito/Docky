import type { ShelfFolder } from "../config/types";
import { mergeOrder } from "../island/pageOrder";

const SEPARATOR = /[\\/]/;

/**
 * As pastas completas (nome e caminho), sem repetir o mesmo caminho; as outras não aparecem na Shelf.
 * Guarda a posição original na lista, porque é por ela que o Rust acha a imagem do ícone.
 */
export function usableFolderEntries(folders: ShelfFolder[]): { folder: ShelfFolder; index: number }[] {
  const seen = new Set<string>();
  return folders
    .map((folder, index) => ({ folder, index }))
    .filter(({ folder }) => {
      const key = folder.path.trim().replace(/[\\/]+$/, "").toLowerCase();
      if (!folder.name.trim() || !key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/**
 * A lista de pastas depois de arrastar as que aparecem na Shelf: `shownOrder` são as posições delas na lista
 * completa, na ordem nova. As que não aparecem (incompletas ou repetidas) ficam onde estavam.
 */
export function reorderFolders(folders: ShelfFolder[], shownOrder: number[]): ShelfFolder[] {
  const order = mergeOrder(
    folders.map((_, i) => String(i)),
    shownOrder.map(String),
  );
  return order.map((i) => folders[Number(i)]);
}

export const usableFolders = (folders: ShelfFolder[]): ShelfFolder[] => usableFolderEntries(folders).map((e) => e.folder);

/**
 * Uma linha curta sobre onde a pasta fica: o nome da pasta, ou, se ele já é o nome escolhido, onde ela está
 * ("em Área de Trabalho"). O caminho inteiro vai no tooltip.
 */
export function folderHint(folder: ShelfFolder): string {
  const parts = folder.path.split(SEPARATOR).filter(Boolean);
  const last = parts[parts.length - 1] ?? "";
  const parent = parts[parts.length - 2];
  const same = last.trim().toLowerCase() === folder.name.trim().toLowerCase();
  if (!same) return last;
  return parent ? `em ${parent}` : last;
}
