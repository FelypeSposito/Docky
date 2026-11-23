import { describe, expect, it } from "vitest";
import { slabPath } from "./slab";

describe("slabPath", () => {
  it("draws the bottom slab and both ears as one shape, open along the screen's edge", () => {
    expect(slabPath("bottom", 100, 40, 16)).toBe(
      "M 0 40 A 16 16 0 0 0 16 24 L 16 16 A 16 16 0 0 1 32 0 L 100 0 A 16 16 0 0 1 116 16 L 116 24 A 16 16 0 0 0 132 40",
    );
  });

  it("comes out of the left edge, and out of the right one mirrored", () => {
    expect(slabPath("left", 100, 40, 16)).toBe(
      "M 0 0 A 16 16 0 0 0 16 16 L 24 16 A 16 16 0 0 1 40 32 L 40 100 A 16 16 0 0 1 24 116 L 16 116 A 16 16 0 0 0 0 132",
    );
    expect(slabPath("right", 100, 40, 16)).toBe(
      "M 40 0 A 16 16 0 0 1 24 16 L 16 16 A 16 16 0 0 0 0 32 L 0 100 A 16 16 0 0 0 16 116 L 24 116 A 16 16 0 0 1 40 132",
    );
  });

  it("keeps the corners inside a slab that is still small", () => {
    // Only 20 px deep: 4 px left for the corner above the ear.
    expect(slabPath("bottom", 100, 20, 22)).toContain("A 4 4 0 0 1");
  });
});
