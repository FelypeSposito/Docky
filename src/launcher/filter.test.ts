import { describe, expect, it } from "vitest";
import { filterShortcuts } from "./filter";

const items = [
  { name: "GitHub", target: "https://github.com" },
  { name: "", target: "C:\\vazio" },
  { name: "Obsidian", target: "C:\\Apps\\obsidian.exe" },
  { name: "Projetos", target: "" },
  { name: "Documentos", target: "C:\\Users\\a\\Documents" },
];

describe("filterShortcuts", () => {
  it("ignora itens incompletos e guarda a posição original", () => {
    expect(filterShortcuts(items, "").map((m) => m.index)).toEqual([0, 2, 4]);
  });

  it("busca sem diferenciar maiúsculas", () => {
    expect(filterShortcuts(items, " obs ").map((m) => m.item.name)).toEqual(["Obsidian"]);
    expect(filterShortcuts(items, "DOC")[0].index).toBe(4);
  });

  it("sem resultado devolve lista vazia", () => {
    expect(filterShortcuts(items, "zzz")).toEqual([]);
  });
});
