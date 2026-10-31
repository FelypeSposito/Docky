import { describe, expect, it } from "vitest";
import { lineIndexAt, parseLrc } from "./lrc";

describe("parseLrc", () => {
  it("lê tempo e texto", () => {
    const lines = parseLrc("[00:12.50] primeira\n[01:05.00] segunda");
    expect(lines).toEqual([
      { timeMs: 12_500, text: "primeira" },
      { timeMs: 65_000, text: "segunda" },
    ]);
  });

  it("aceita várias marcas na mesma linha e ordena", () => {
    const lines = parseLrc("[00:30.00][00:10.00] refrão\n[00:20.00] verso");
    expect(lines.map((l) => l.timeMs)).toEqual([10_000, 20_000, 30_000]);
    expect(lines[0].text).toBe("refrão");
  });

  it("ignora metadados e linhas sem tempo", () => {
    expect(parseLrc("[ar:Alguém]\n[ti:Algo]\nsó texto")).toEqual([]);
  });

  it("normaliza centésimos e milésimos", () => {
    expect(parseLrc("[00:01.5] a")[0].timeMs).toBe(1500);
    expect(parseLrc("[00:01.05] a")[0].timeMs).toBe(1050);
    expect(parseLrc("[00:01.123] a")[0].timeMs).toBe(1123);
  });

  it("mantém linhas vazias (pausas instrumentais)", () => {
    expect(parseLrc("[00:05.00]")).toEqual([{ timeMs: 5000, text: "" }]);
  });
});

describe("lineIndexAt", () => {
  const lines = parseLrc("[00:10.00] a\n[00:20.00] b\n[00:30.00] c");

  it("é −1 antes da primeira linha", () => {
    expect(lineIndexAt(lines, 5000)).toBe(-1);
  });

  it("acha a linha atual", () => {
    expect(lineIndexAt(lines, 10_000)).toBe(0);
    expect(lineIndexAt(lines, 25_000)).toBe(1);
    expect(lineIndexAt(lines, 999_000)).toBe(2);
  });

  it("aplica o atraso", () => {
    expect(lineIndexAt(lines, 8000, 2000)).toBe(0);
    expect(lineIndexAt(lines, 22_000, -3000)).toBe(0);
  });

  it("lida com lista vazia", () => {
    expect(lineIndexAt([], 1000)).toBe(-1);
  });
});
