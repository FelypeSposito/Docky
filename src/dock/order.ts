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
