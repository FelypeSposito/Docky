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

describe("filterShortcuts com grupos", () => {
  const list = [
    { id: "a", name: "Chrome", target: "C:\chrome.exe" },
    { id: "g", name: "Trabalho", target: "", group: true, members: ["a"] },
    { id: "v", name: "Vazio", target: "", group: true, members: [] },
    { id: "x", name: "Órfão", target: "", group: true, members: ["sumiu"] },
  ];

  it("mostra grupos que têm ao menos um membro existente", () => {
    expect(filterShortcuts(list, "").map((m) => m.item.id)).toEqual(["a", "g"]);
  });
});

describe("filterShortcuts com ocultos", () => {
  it("não mostra os ocultos", () => {
    const list = [
      { id: "a", name: "Chrome", target: "C:\\chrome.exe", hidden: true },
      { id: "b", name: "Spotify", target: "C:\\spotify.exe" },
      { id: "g", name: "Trabalho", target: "", group: true, members: ["a"] },
    ];
    expect(filterShortcuts(list, "").map((m) => m.item.id)).toEqual(["b", "g"]);
  });
});
