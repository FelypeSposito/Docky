import type { Shortcut } from "../config/types";
import { filterShortcuts } from "./filter";

/** Quantos atalhos cabem na ilha aberta antes de expandir. */
export const ISLAND_SLOTS = 8;

/** Os grupos antes dos atalhos comuns, cada parte na ordem em que está. */
export const groupsFirst = <T extends { item: Shortcut }>(list: T[]): T[] => [...list.filter((e) => e.item.group), ...list.filter((e) => !e.item.group)];

/** Os atalhos que aparecem na ilha aberta, na ordem em que aparecem (os grupos primeiro, sem os ocultos). */
export const islandShortcuts = (shortcuts: Shortcut[]) => groupsFirst(filterShortcuts(shortcuts, "")).slice(0, ISLAND_SLOTS);

/** Os ids dos atalhos que aparecem na ilha. */
export const islandIds = (shortcuts: Shortcut[]): Set<string> => new Set(islandShortcuts(shortcuts).map((e) => e.item.id));

/**
 * Põe um atalho na ilha (ele vira o primeiro dos atalhos comuns) ou tira (ele vai para logo depois do último que
 * continua nela, e o próximo da lista sobe para o lugar dele). Grupos e ids que não existem não mudam nada.
 */
export function toggleIsland(shortcuts: Shortcut[], id: string): Shortcut[] {
  const item = shortcuts.find((s) => s.id === id);
  if (!item || item.group) return shortcuts;
  const rest = shortcuts.filter((s) => s.id !== id);
  const at = (position: number) => [...rest.slice(0, position), item, ...rest.slice(position)];

  if (!islandIds(shortcuts).has(id)) {
    const firstPlain = rest.findIndex((s) => !s.group);
    return at(firstPlain < 0 ? rest.length : firstPlain);
  }
  const stays = islandShortcuts(rest).map((e) => e.item.id);
  const last = stays.length > 0 ? rest.findIndex((s) => s.id === stays[stays.length - 1]) : -1;
  return at(last + 1);
}
