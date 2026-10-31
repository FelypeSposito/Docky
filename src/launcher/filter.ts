export interface ShortcutLike {
  name: string;
  target: string;
}

/**
 * Atalhos completos (com nome e destino) que combinam com a busca. Guarda a posição original na lista,
 * porque é por ela que o Rust acha o item a abrir.
 */
export function filterShortcuts<T extends ShortcutLike>(items: T[], query: string): { item: T; index: number }[] {
  const q = query.trim().toLowerCase();
  return items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.name.trim() !== "" && item.target.trim() !== "")
    .filter(({ item }) => !q || item.name.toLowerCase().includes(q));
}
