import { describe, expect, it } from "vitest";
import { gelStretch } from "./hooks";
import { lightAngle, shortestTurn } from "./useLiquidGlass";

const box = { left: 100, top: 0, width: 200, height: 40 };

describe("lightAngle", () => {
  it("measures clockwise from straight up, around the island's center", () => {
    expect(lightAngle(box, 200, -100)).toBeCloseTo(0);
    expect(lightAngle(box, 400, 20)).toBeCloseTo(90);
    expect(lightAngle(box, 200, 300)).toBeCloseTo(180);
    expect(lightAngle(box, 0, 20)).toBeCloseTo(270);
  });
});

describe("shortestTurn", () => {
  it("goes the short way around", () => {
    expect(shortestTurn(350, 10)).toBe(20);
    expect(shortestTurn(10, 350)).toBe(-20);
    expect(shortestTurn(0, 180)).toBe(-180);
    expect(shortestTurn(90, 90)).toBe(0);
  });
});

describe("gelStretch", () => {
  it("is still when the island is still", () => {
    expect(gelStretch(0, 0)).toBe(0);
    expect(gelStretch(50, 50)).toBe(0);
  });

  it("stretches down while growing taller, the other way while getting wider", () => {
    expect(gelStretch(1200, 0)).toBeCloseTo(0.02);
    expect(gelStretch(0, 1800)).toBeCloseTo(-0.02);
  });

  it("never goes past 3%", () => {
    expect(gelStretch(99999, 0)).toBe(0.03);
    expect(gelStretch(-99999, 0)).toBe(-0.03);
  });
});
