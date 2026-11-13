import { describe, expect, it } from "vitest";
import { type Candidate, fold, noteTitle, rank, score } from "./search";

const c = (id: string, kind: Candidate["kind"], title: string, keywords?: string): Candidate => ({ id, kind, title, keywords });

describe("busca geral", () => {
  it("ignora acento e maiúscula", () => {
    expect(fold("  Música ")).toBe("musica");
    expect(score(c("1", "page", "Música"), "musi")).toBe(100);
  });

  it("começo do título vale mais que começo de palavra, que vale mais que o meio", () => {
    expect(score(c("1", "shortcut", "Steam"), "st")).toBe(100);
    expect(score(c("2", "note", "Rever o standup"), "st")).toBe(70);
    expect(score(c("3", "shortcut", "Obsidian"), "si")).toBe(50);
    expect(score(c("4", "page", "Foco", "pomodoro timer"), "pomo")).toBe(40);
    expect(score(c("5", "page", "Foco"), "xyz")).toBe(0);
  });

  it("ordena por combinação, depois por tipo, e corta no limite", () => {
    const list = [c("n", "note", "Steam deck"), c("s", "shortcut", "Steam"), c("p", "page", "Sistema"), c("a", "action", "Salvar como nota")];
    expect(rank(list, "s").map((x) => x.id)).toEqual(["s", "a", "p", "n"]);
    expect(rank(list, "s", 2).map((x) => x.id)).toEqual(["s", "a"]);
    expect(rank(list, "")).toEqual([]);
  });

  it("tira o título da primeira linha da nota", () => {
    expect(noteTitle("\n# Ideias\ncorpo")).toBe("Ideias");
    expect(noteTitle("   ")).toBe("Nota sem texto");
  });
});
