/**
 * The dock's outline as one SVG path: the slab and its two concave ears in a single shape, so the fill and the lit rim
 * run on from the slab into the ears with no seam (three separate pieces showed their joins, and the ears looked
 * added on). Drawn along the screen's edge: `length` is the slab's size along the edge, `depth` how far it comes out.
 */

export type SlabSide = "bottom" | "left" | "right";

/** Ear size (px): the concave curve joining the slab to the screen's edge, as on the island. */
export const EAR = 16;

const n = (value: number) => Math.round(value * 100) / 100;

/**
 * The path, in the coordinates of a box that holds the slab and both ears: for the bottom, `length + 2 × ear` wide and
 * `depth` tall; for the sides, `depth` wide and `length + 2 × ear` tall. It starts and ends on the screen's edge and
 * is left open there, so a stroke draws the rim on the three sides that face the room and not along the edge.
 */
export function slabPath(side: SlabSide, length: number, depth: number, radius: number, ear = EAR): string {
  const r = Math.max(0, Math.min(radius, depth - ear, length / 2));
  const e = ear;
  // Built along the edge (u) and away from it (v), then turned to the side. The right side is a mirror of the other
  // two, so its arcs turn the other way.
  const point = (u: number, v: number) => {
    if (side === "bottom") return `${n(u)} ${n(depth - v)}`;
    if (side === "left") return `${n(v)} ${n(u)}`;
    return `${n(depth - v)} ${n(u)}`;
  };
  const concave = side === "right" ? 1 : 0;
  const convex = side === "right" ? 0 : 1;
  const arc = (rad: number, sweep: number, u: number, v: number) => `A ${n(rad)} ${n(rad)} 0 0 ${sweep} ${point(u, v)}`;
  return [
    `M ${point(0, 0)}`,
    arc(e, concave, e, e),
    `L ${point(e, depth - r)}`,
    arc(r, convex, e + r, depth),
    `L ${point(e + length - r, depth)}`,
    arc(r, convex, e + length, depth - r),
    `L ${point(e + length, e)}`,
    arc(e, concave, length + 2 * e, 0),
  ].join(" ");
}
