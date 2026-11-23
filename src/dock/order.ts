/** Reordering the dock by dragging: where an app lands and where the others slide to make room. */

/** `keys` with the item at `from` moved to `to`. */
export function moveKey<T>(keys: readonly T[], from: number, to: number): T[] {
  const next = keys.slice();
  if (from < 0 || from >= next.length) return next;
  const [item] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(next.length, to)), 0, item);
  return next;
}

/**
 * The place an app dragged from `from` lands, given the centres of the dock's apps along its axis (before the drag)
 * and where the dragged app's centre is now: the slot whose centre is nearest.
 */
export function dropIndex(centers: readonly number[], from: number, position: number): number {
  if (centers.length === 0) return from;
  let best = 0;
  for (let i = 1; i < centers.length; i++) if (Math.abs(centers[i] - position) < Math.abs(centers[best] - position)) best = i;
  return best;
}

/** How far the app at `index` slides while the one at `from` hovers over `to`: one slot (`step`) out of the way, or 0. */
export function slideFor(index: number, from: number, to: number, step: number): number {
  if (index === from) return 0;
  if (from < to && index > from && index <= to) return -step;
  if (to < from && index >= to && index < from) return step;
  return 0;
}

/** An app on the dock as drawn: apps that just closed stay a moment (`leaving`) so they can shrink away. */
export interface Shown<T> {
  item: T;
  /** When a closed app's shrinking is over (ms, `Date.now()`); absent while the app is on the dock. */
  leaving?: number;
  /** It just arrived (not on the first reading), so it grows in. */
  entering?: boolean;
}

/**
 * The dock's new list with the apps that left kept where they were, after the nearest app before them that stayed,
 * until `until`. An app that comes back before that is simply on the dock again.
 */
export function withLeaving<T extends { key: string }>(prev: readonly Shown<T>[], next: readonly T[], until: number, now: number): Shown<T>[] {
  const nextKeys = new Set(next.map((a) => a.key));
  const prevKeys = new Set(prev.map((s) => s.item.key));
  const result: Shown<T>[] = next.map((item) => ({ item, entering: prev.length > 0 && !prevKeys.has(item.key) }));
  prev.forEach((shown, i) => {
    if (nextKeys.has(shown.item.key)) return;
    if (shown.leaving !== undefined && shown.leaving <= now) return;
    let at = 0;
    for (let j = i - 1; j >= 0; j--) {
      const found = result.findIndex((r) => r.item.key === prev[j].item.key);
      if (found >= 0) {
        at = found + 1;
        break;
      }
    }
    result.splice(at, 0, { item: shown.item, leaving: shown.leaving ?? until });
  });
  return result;
}
