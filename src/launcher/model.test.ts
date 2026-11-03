import { describe, expect, it } from "vitest";
import type { Shortcut } from "../config/types";
import { cleanTarget, confirmationText, groupedIds, hideGrouped, hideableCount, isUsable, memberSummary, membersOf, needsConfirmation, removeShortcut, reorderSection, setHidden, splitShortcuts, targetKind, toggleMember } from "./model";

const item = (id: string, name: string, target = "", extra: Partial<Shortcut> = {}): Shortcut => ({ id, name, target, icon: "", group: false, members: [], ...extra });

describe("destino do atalho", () => {
  it("tira aspas e espaços", () => {
    expect(cleanTarget('  "C:\\Users\\x\\Bambuzal.lnk" ')).toBe("C:\\Users\\x\\Bambuzal.lnk");
  });

  it("separa app, site e o resto", () => {
    expect(targetKind('"C:\\Games\\Bambuzal.lnk"')).toBe("app");
    expect(targetKind("C:\\Program Files\\x\\app.EXE")).toBe("app");
    expect(targetKind("steam://rungameid/730")).toBe("app");
    expect(targetKind("shell:AppsFolder\\Microsoft.WindowsCalculator_8wekyb3d8bbwe!App")).toBe("app");
    expect(targetKind("https://sposence.com.br")).toBe("site");
    expect(targetKind("C:\\Users\\x\\Documentos")).toBe("other");
    expect(targetKind("C:\\x\\planilha.xlsx")).toBe("other");
  });
});

describe("confirmação", () => {
  const list = [item("a", "Chrome", "C:\\chrome.exe"), item("b", "Docs", "C:\\Docs"), item("c", "Site", "https://a.dev"), item("g", "Trabalho", "", { group: true, members: ["a", "c"] })];

  it("pede para apps e grupos, não para sites e pastas", () => {
    expect(needsConfirmation(list[0], list, true)).toBe(true);
    expect(needsConfirmation(list[3], list, true)).toBe(true);
    expect(needsConfirmation(list[1], list, true)).toBe(false);
    expect(needsConfirmation(list[2], list, true)).toBe(false);
  });

  it("não pede nada com a opção desligada", () => {
    expect(needsConfirmation(list[0], list, false)).toBe(false);
    expect(needsConfirmation(list[3], list, false)).toBe(false);
  });

  it("a pergunta diz o que vai abrir", () => {
    expect(confirmationText(list[0], list)).toBe("Abrir Chrome?");
    expect(confirmationText(list[3], list)).toBe("Abrir Trabalho (Chrome, Site)?");
  });
});

describe("grupos", () => {
  it("só abre membros que existem e não são grupos", () => {
    const list = [item("a", "A", "x"), item("g", "G", "", { group: true, members: ["a", "g", "zzz"] })];
    expect(membersOf(list[1], list).map((s) => s.id)).toEqual(["a"]);
  });

  it("liga e desliga membros na ordem marcada", () => {
    let group = item("g", "G", "", { group: true });
    group = toggleMember(toggleMember(toggleMember(group, "b"), "a"), "c");
    expect(group.members).toEqual(["b", "a", "c"]);
    expect(toggleMember(group, "a").members).toEqual(["b", "c"]);
  });

  it("remover um atalho tira ele dos grupos", () => {
    const list = [item("a", "A", "x"), item("b", "B", "y"), item("g", "G", "", { group: true, members: ["a", "b"] })];
    const next = removeShortcut(list, 0);
    expect(next.map((s) => s.id)).toEqual(["b", "g"]);
    expect(next[1].members).toEqual(["b"]);
  });

  it("só aparece quem tem nome e destino (ou membros)", () => {
    const list = [item("a", "A", "x"), item("n", "", "y"), item("e", "E", "  "), item("g", "G", "", { group: true, members: ["a"] }), item("h", "H", "", { group: true })];
    expect(list.map((s) => isUsable(s, list))).toEqual([true, false, false, true, false]);
  });
});

describe("resumo dos itens do grupo", () => {
  const list = [item("a", "Chrome", "x"), item("b", "Claude", "y"), item("c", "Spotify", "z"), item("g", "Trabalho", "", { group: true, members: ["a", "b", "c"] }), item("v", "Vazio", "", { group: true })];

  it("mostra os dois primeiros e quantos mais há", () => {
    expect(memberSummary(list[3], list)).toBe("Chrome, Claude +1");
    expect(memberSummary({ ...list[3], members: ["a", "b"] }, list)).toBe("Chrome, Claude");
    expect(memberSummary(list[4], list)).toBe("Sem itens");
  });
});

describe("grupos separados dos atalhos", () => {
  const list = [item("a", "A", "x"), item("g1", "G1", "", { group: true, members: ["a"] }), item("b", "B", "y"), item("g2", "G2", "", { group: true, members: ["b"] }), item("c", "C", "z")];

  it("separa em duas partes sem perder a posição original", () => {
    const { groups, items } = splitShortcuts(list);
    expect(groups.map((e) => [e.item.id, e.index])).toEqual([["g1", 1], ["g2", 3]]);
    expect(items.map((e) => [e.item.id, e.index])).toEqual([["a", 0], ["b", 2], ["c", 4]]);
  });

  it("reordenar uma parte não mexe na outra e deixa os grupos primeiro", () => {
    expect(reorderSection(list, false, ["c", "a", "b"]).map((s) => s.id)).toEqual(["g1", "g2", "c", "a", "b"]);
    expect(reorderSection(list, true, ["g2", "g1"]).map((s) => s.id)).toEqual(["g2", "g1", "a", "b", "c"]);
  });

  it("oculta só os atalhos que estão em grupos", () => {
    expect([...groupedIds(list)].sort()).toEqual(["a", "b"]);
    expect(hideableCount(list)).toBe(2);
    const next = hideGrouped(list);
    expect(next.filter((s) => s.hidden).map((s) => s.id)).toEqual(["a", "b"]);
    expect(hideableCount(next)).toBe(0);
    expect(hideGrouped(next)).toEqual(next);
  });

  it("mostra e oculta um atalho", () => {
    const hidden = setHidden(list, "c", true);
    expect(hidden.find((s) => s.id === "c")?.hidden).toBe(true);
    expect(setHidden(hidden, "c", false).find((s) => s.id === "c")?.hidden).toBe(false);
  });
});
