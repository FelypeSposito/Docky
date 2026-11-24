import { describe, expect, it } from "vitest";
import { restingClawd } from "./clawd";

const at = (hours: number, minutes: number) => new Date(2026, 10, 24, hours, minutes);

describe("Clawd sem nada para fazer", () => {
  it("dorme de madrugada", () => {
    expect(restingClawd(at(2, 30)).title).toBe("O Clawd dormindo");
    expect(restingClawd(at(5, 59)).title).toBe("O Clawd dormindo");
  });

  it("de dia muda a cada minuto e não fica só dançando", () => {
    const titles = new Set(Array.from({ length: 6 }, (_, i) => restingClawd(at(14, i)).title));
    expect(titles.size).toBeGreaterThanOrEqual(4);
    expect(titles).toContain("O Clawd de bobeira");
    expect(restingClawd(at(14, 0)).title).toBe(restingClawd(at(14, 0)).title);
    expect(restingClawd(at(14, 0)).title).not.toBe(restingClawd(at(14, 1)).title);
  });
});
