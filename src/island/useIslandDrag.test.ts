import { describe, expect, it } from "vitest";
import { positionFor } from "./useIslandDrag";

describe("positionFor", () => {
  it("vai de 0 (encostada à esquerda) a 1 (encostada à direita)", () => {
    expect(positionFor(0, 200, 1200)).toBe(0);
    expect(positionFor(1000, 200, 1200)).toBe(1);
    expect(positionFor(250, 200, 1200)).toBeCloseTo(0.25);
  });

  it("não passa das bordas da tela", () => {
    expect(positionFor(-80, 200, 1200)).toBe(0);
    expect(positionFor(1400, 200, 1200)).toBe(1);
  });

  it("perto do meio, volta para o centro", () => {
    expect(positionFor(510, 200, 1200)).toBe(0.5);
    expect(positionFor(470, 200, 1200)).not.toBe(0.5);
  });

  it("ilha mais larga que a tela fica no centro", () => {
    expect(positionFor(0, 1300, 1200)).toBe(0.5);
  });
});
