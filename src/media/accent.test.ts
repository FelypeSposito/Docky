import { describe, expect, it } from "vitest";
import { pickAccent } from "./accent";

function solid(r: number, g: number, b: number, count = 64): Uint8ClampedArray {
  const data = new Uint8ClampedArray(count * 4);
  for (let i = 0; i < count; i++) data.set([r, g, b, 255], i * 4);
  return data;
}

describe("pickAccent", () => {
  it("acha o tom de uma imagem colorida", () => {
    const accent = pickAccent(solid(220, 40, 60));
    const hue = Number(accent?.primary.match(/^hsl\((\d+)/)?.[1]);
    expect(hue).toBeGreaterThan(340);
    expect(hue).toBeLessThan(360);
  });

  it("ignora imagens cinza, pretas e brancas", () => {
    expect(pickAccent(solid(128, 128, 128))).toBeNull();
    expect(pickAccent(solid(0, 0, 0))).toBeNull();
    expect(pickAccent(solid(255, 255, 255))).toBeNull();
  });

  it("ignora pixels transparentes", () => {
    const data = solid(220, 40, 60);
    for (let i = 3; i < data.length; i += 4) data[i] = 0;
    expect(pickAccent(data)).toBeNull();
  });
});
