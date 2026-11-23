import { describe, expect, it } from "vitest";
import { dropIndex, moveKey, slideFor, withLeaving } from "./order";

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

describe("withLeaving", () => {
  const app = (key: string) => ({ key });
  const shown = (keys: string[]) => keys.map((key) => ({ item: app(key) }));

  it("keeps a closed app in its place while it shrinks away", () => {
    const next = withLeaving(shown(["a", "b", "c"]), [app("a"), app("c")], 1300, 1000);
    expect(next.map((s) => [s.item.key, s.leaving ?? null])).toEqual([
      ["a", null],
      ["b", 1300],
      ["c", null],
    ]);
  });

  it("lets it go once the shrinking is over, and grows the new ones in", () => {
    const leaving = [{ item: app("a") }, { item: app("b"), leaving: 1300 }];
    const next = withLeaving(leaving, [app("a"), app("d")], 1700, 1400);
    expect(next.map((s) => [s.item.key, s.entering])).toEqual([
      ["a", false],
      ["d", true],
    ]);
  });

  it("does not grow anything in on the first reading", () => {
    expect(withLeaving([], [app("a")], 0, 0)[0].entering).toBe(false);
  });

  it("puts a closed first app back at the front", () => {
    expect(withLeaving(shown(["a", "b"]), [app("b")], 300, 0).map((s) => s.item.key)).toEqual(["a", "b"]);
  });
});
