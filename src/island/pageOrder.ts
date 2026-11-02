/**
 * Páginas na ordem que o usuário escolheu (`saved`). Páginas novas que ainda não estão na lista guardada
 * entram no fim, na ordem original, e ids que não existem mais são ignorados.
 */
export function orderPages<T extends { id: string }>(pages: T[], saved: string[]): T[] {
  const byId = new Map(pages.map((p) => [p.id, p]));
  const seen = new Set<string>();
  const chosen: T[] = [];
  for (const id of saved) {
    const page = byId.get(id);
    if (page && !seen.has(id)) {
      seen.add(id);
      chosen.push(page);
    }
  }
  return [...chosen, ...pages.filter((p) => !seen.has(p.id))];
}

/** Cópia da lista com o item de `from` movido para a posição `to`. */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(Math.min(Math.max(to, 0), next.length), 0, item);
  return next;
}

/**
 * As páginas que aparecem no dock: na ordem escolhida e sem as escondidas. Nunca devolve uma lista vazia:
 * se todas estiverem escondidas, a primeira continua à vista.
 */
export function visiblePages<T extends { id: string }>(pages: T[], saved: string[], hidden: string[]): T[] {
  const ordered = orderPages(pages, saved);
  const shown = ordered.filter((p) => !hidden.includes(p.id));
  return shown.length > 0 ? shown : ordered.slice(0, 1);
}
