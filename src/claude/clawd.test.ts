import { describe, expect, it } from "vitest";
import { restingClawd } from "./clawd";

const at = (hours: number, minutes: number) => new Date(2026, 10, 24, hours, minutes);

describe("Clawd sem nada para fazer", () => {
  it("dorme quando você está longe do computador, a qualquer hora", () => {
    expect(restingClawd(at(14, 30), true).title).toBe("O Clawd dormindo");
    expect(restingClawd(at(2, 30), true).title).toBe("O Clawd dormindo");
  });

  it("de madrugada, com você no computador, ele não dorme", () => {
    expect(restingClawd(at(2, 30), false).title).not.toBe("O Clawd dormindo");
  });

  it("muda a cada minuto e não fica só dançando", () => {
    const titles = new Set(Array.from({ length: 6 }, (_, i) => restingClawd(at(14, i), false).title));
    expect(titles.size).toBeGreaterThanOrEqual(4);
    expect(titles).toContain("O Clawd de bobeira");
    expect(restingClawd(at(14, 0), false).title).not.toBe(restingClawd(at(14, 1), false).title);
  });
});
