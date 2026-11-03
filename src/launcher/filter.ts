export interface ShortcutLike {
  name: string;
  target: string;
  id?: string;
  group?: boolean;
  members?: string[];
  /** Oculto da lista (continua valendo dentro dos grupos). */
  hidden?: boolean;
}

/**
 * Atalhos prontos (com nome e destino, ou grupos com ao menos um membro) que combinam com a busca. Guarda a posição
 * original na lista, porque é por ela que o Rust acha o item a abrir.
 */
export function filterShortcuts<T extends ShortcutLike>(items: T[], query: string): { item: T; index: number }[] {
  const q = query.trim().toLowerCase();
  const plainIds = new Set(items.filter((s) => !s.group).map((s) => s.id));
  const ready = (item: T) =>
    !item.hidden && item.name.trim() !== "" && (item.group ? (item.members ?? []).some((m) => plainIds.has(m)) : item.target.trim() !== "");
  return items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => ready(item))
    .filter(({ item }) => !q || item.name.toLowerCase().includes(q));
}
