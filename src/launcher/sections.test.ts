import { describe, expect, it } from "vitest";
import type { Shortcut, ShortcutSection } from "../config/types";
import { addSection, assignSection, autoOrganize, layoutSections, pruneSections, removeSection, renameSection, sectionOf, toggleCollapsed } from "./sections";

const shortcut = (id: string, name: string, target = "", extra: Partial<Shortcut> = {}): Shortcut => ({ id, name, target, icon: "", group: false, members: [], ...extra });
const section = (id: string, name: string, members: string[] = [], collapsed = false): ShortcutSection => ({ id, name, collapsed, members });
const ids = () => {
  let n = 0;
  return () => `sec${++n}`;
};
const indexed = (list: Shortcut[]) => list.map((item, index) => ({ item, index }));

describe("seções dos atalhos", () => {
  const list = [shortcut("a", "Steam", "C:/Steam.lnk"), shortcut("b", "WhatsApp"), shortcut("c", "Calculadora"), shortcut("d", "Discord")];

  it("divide na ordem das seções, mantém a ordem da lista dentro de cada uma e põe os soltos no fim", () => {
    const sections = [section("s1", "Comunicação", ["d", "b"]), section("s2", "Jogos", ["a"])];
    const blocks = layoutSections(indexed(list), sections);
    expect(blocks.map((b) => [b.section?.name ?? null, b.entries.map((e) => e.item.id)])).toEqual([
      ["Comunicação", ["b", "d"]],
      ["Jogos", ["a"]],
      [null, ["c"]],
    ]);
    expect(blocks[0].entries[1].index).toBe(3);
  });

  it("esconde seção vazia, a não ser que peça para mostrar", () => {
    const sections = [section("s1", "Vazia"), section("s2", "Jogos", ["a"])];
    expect(layoutSections(indexed(list), sections).map((b) => b.section?.id ?? null)).toEqual(["s2", null]);
    expect(layoutSections(indexed(list), sections, true).map((b) => b.section?.id ?? null)).toEqual(["s1", "s2", null]);
  });

  it("um atalho fica numa seção só, e dá para tirar de todas", () => {
    let sections = [section("s1", "A", ["a"]), section("s2", "B")];
    sections = assignSection(sections, "a", "s2");
    expect(sections.map((s) => s.members)).toEqual([[], ["a"]]);
    expect(sectionOf("a", sections)?.id).toBe("s2");
    sections = assignSection(sections, "a", null);
    expect(sections.map((s) => s.members)).toEqual([[], []]);
  });

  it("cria, renomeia, recolhe e apaga (os atalhos da apagada ficam soltos)", () => {
    let sections = addSection([], "  Jogos ", ids());
    expect(sections).toEqual([{ id: "sec1", name: "Jogos", collapsed: false, members: [] }]);
    sections = renameSection(sections, "sec1", "Games");
    sections = renameSection(sections, "sec1", "   ");
    expect(sections[0].name).toBe("Games");
    expect(toggleCollapsed(sections, "sec1")[0].collapsed).toBe(true);
    expect(removeSection(assignSection(sections, "a", "sec1"), "sec1")).toEqual([]);
  });

  it("limpa ids de atalhos que sumiram ou viraram grupo", () => {
    const sections = [section("s1", "X", ["a", "zz", "g"])];
    expect(pruneSections(sections, [...list, shortcut("g", "Grupo", "", { group: true })])[0].members).toEqual(["a"]);
  });
});

describe("organizar automaticamente", () => {
  const list = [
    shortcut("cs", "Counter-Strike 2", "steam://rungameid/730"),
    shortcut("wa", "WhatsApp", "shell:AppsFolder\\WhatsApp"),
    shortcut("sp", "Spotify", "shell:AppsFolder\\Spotify"),
    shortcut("vs", "Visual Studio Code", "C:/Code.lnk"),
    shortcut("ob", "Obsidian", "C:/Obsidian.lnk"),
    shortcut("ex", "File Explorer", "C:/explorer.lnk"),
    shortcut("x", "SPOSENCE", "https://www.sposence.com.br/"),
    shortcut("h", "Gmail", "https://mail.google.com", { hidden: true }),
    shortcut("g", "Trabalho", "", { group: true, members: ["ob"] }),
  ];

  it("cria só as seções que ganham atalhos, na ordem das prontas, e deixa o resto solto", () => {
    const sections = autoOrganize(list, [], ids());
    expect(sections.map((s) => [s.name, s.members])).toEqual([
      ["Jogos", ["cs"]],
      ["Comunicação", ["wa"]],
      ["Música e vídeo", ["sp"]],
      ["Desenvolvimento", ["vs"]],
      ["Trabalho", ["ob"]],
      ["Utilitários", ["ex"]],
    ]);
  });

  it("respeita o que a pessoa já organizou e reaproveita a seção de mesmo nome", () => {
    const mine = [section("m", "Favoritos", ["cs"]), section("j", "jogos")];
    const sections = autoOrganize([...list, shortcut("st", "Steam", "C:/Steam.lnk")], mine, ids());
    expect(sections[0]).toEqual(section("m", "Favoritos", ["cs"]));
    expect(sections.find((s) => s.id === "j")?.members).toEqual(["st"]);
  });
});
