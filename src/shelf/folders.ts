import type { ShelfFolder } from "../config/types";

const SEPARATOR = /[\\/]/;

/** As pastas completas (nome e caminho), sem repetir o mesmo caminho; as outras não aparecem na Shelf. */
export function usableFolders(folders: ShelfFolder[]): ShelfFolder[] {
  const seen = new Set<string>();
  return folders.filter((folder) => {
    const key = folder.path.trim().replace(/[\\/]+$/, "").toLowerCase();
    if (!folder.name.trim() || !key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

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
