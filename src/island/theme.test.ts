import { describe, expect, it } from "vitest";
import { DEFAULT_ACCENT } from "../media/accent";
import { glowOpacity, glowReach, islandAccent, islandColor } from "./theme";

describe("islandAccent", () => {
  const music = { primary: "hsl(200 80% 60%)", secondary: "hsl(248 70% 50%)" };

  it("follows the music when no color is picked", () => {
    expect(islandAccent("", music)).toEqual(music);
  });

  it("falls back to the brand pink without music", () => {
    expect(islandAccent("", null)).toEqual(DEFAULT_ACCENT);
  });

  it("keeps the picked color even while music plays", () => {
    expect(islandAccent("green", music).primary).toBe("#34d399");
  });

  it("treats an unknown id as following the music", () => {
    expect(islandColor("teal")).toBeNull();
    expect(islandAccent("teal", music)).toEqual(music);
  });
});

describe("glowOpacity", () => {
  it("keeps the old look at the default and below", () => {
    expect(glowOpacity(70)).toBeCloseTo(0.434, 3);
    expect(glowOpacity(35)).toBeCloseTo(0.217, 3);
    expect(glowOpacity(0)).toBe(0);
  });

  it("is much brighter at the top than it used to be (0.62)", () => {
    expect(glowOpacity(100)).toBeCloseTo(0.95, 3);
  });

  it("only grows as the slider goes up", () => {
    for (let step = 1; step <= 100; step++) expect(glowOpacity(step)).toBeGreaterThan(glowOpacity(step - 1));
  });

  it("survives values out of range", () => {
    expect(glowOpacity(250)).toBeCloseTo(0.95, 3);
    expect(glowOpacity(-5)).toBe(0);
    expect(glowOpacity(Number.NaN)).toBeCloseTo(0.434, 3);
  });
});

describe("glowReach", () => {
  it("is zero up to the default and one at the top", () => {
    expect(glowReach(40)).toBe(0);
    expect(glowReach(70)).toBe(0);
    expect(glowReach(85)).toBeCloseTo(0.5, 3);
    expect(glowReach(100)).toBe(1);
  });
});
