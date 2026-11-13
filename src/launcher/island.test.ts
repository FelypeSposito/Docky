import { describe, expect, it } from "vitest";
import type { Shortcut } from "../config/types";
import { ISLAND_SLOTS, islandIds, toggleIsland } from "./island";

const app = (id: string, extra: Partial<Shortcut> = {}): Shortcut => ({ id, name: id, target: `C:/${id}.exe`, icon: "", group: false, members: [], ...extra });
const group = (id: string, members: string[]): Shortcut => ({ id, name: id, target: "", icon: "", group: true, members });
const ids = (list: Shortcut[]) => list.map((s) => s.id);

describe("os atalhos da ilha", () => {
  const ten = Array.from({ length: 10 }, (_, i) => app(`a${i}`));

  it("são os 8 primeiros prontos, grupos antes, sem os ocultos", () => {
    const list = [app("x", { hidden: true }), ...ten, group("g", ["a0"])];
    const top = islandIds(list);
    expect(top.size).toBe(ISLAND_SLOTS);
    expect(top.has("g")).toBe(true);
    expect(top.has("x")).toBe(false);
    expect(top.has("a6")).toBe(true);
    expect(top.has("a7")).toBe(false);
  });

  it("pôr na ilha leva o atalho para o começo dos comuns", () => {
    const next = toggleIsland(ten, "a9");
    expect(ids(next).slice(0, 2)).toEqual(["a9", "a0"]);
    expect(islandIds(next).has("a9")).toBe(true);
    expect(islandIds(next).has("a7")).toBe(false);
  });

  it("tirar da ilha leva o atalho para logo depois dos que ficam, e o próximo sobe", () => {
    const next = toggleIsland(ten, "a2");
    expect(islandIds(next).has("a2")).toBe(false);
    expect(islandIds(next).has("a8")).toBe(true);
    expect(ids(next).indexOf("a2")).toBe(ids(next).indexOf("a8") + 1);
  });

  it("grupos e ids desconhecidos não mudam", () => {
    const list = [group("g", ["a0"]), ...ten];
    expect(toggleIsland(list, "g")).toBe(list);
    expect(toggleIsland(list, "nada")).toBe(list);
  });
});
