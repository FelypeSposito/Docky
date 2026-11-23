import { describe, expect, it } from "vitest";
import { dropIndex, moveKey, slideFor } from "./order";

describe("moveKey", () => {
  it("moves an app forward and back", () => {
    expect(moveKey(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveKey(["a", "b", "c", "d"], 3, 0)).toEqual(["d", "a", "b", "c"]);
    expect(moveKey(["a", "b"], 1, 1)).toEqual(["a", "b"]);
  });

  it("keeps the list when the place is out of range", () => {
    expect(moveKey(["a", "b"], 5, 0)).toEqual(["a", "b"]);
    expect(moveKey(["a", "b"], 0, 9)).toEqual(["b", "a"]);
  });
});

describe("dropIndex", () => {
  const centers = [20, 64, 108, 152];

  it("lands on the nearest slot", () => {
    expect(dropIndex(centers, 0, 20)).toBe(0);
    expect(dropIndex(centers, 0, 90)).toBe(2);
    expect(dropIndex(centers, 3, -50)).toBe(0);
    expect(dropIndex(centers, 1, 400)).toBe(3);
  });

  it("stays put on an empty dock", () => {
    expect(dropIndex([], 2, 100)).toBe(2);
  });
});

describe("slideFor", () => {
  it("moves the apps between the two places one slot over", () => {
    // Dragging the first app to the third place: the second and third slide back.
    expect([0, 1, 2, 3].map((i) => slideFor(i, 0, 2, 44))).toEqual([0, -44, -44, 0]);
    // Dragging the last app to the front: the others slide forward.
    expect([0, 1, 2, 3].map((i) => slideFor(i, 3, 0, 44))).toEqual([44, 44, 44, 0]);
  });
});
