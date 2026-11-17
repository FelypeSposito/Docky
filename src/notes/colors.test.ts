import { describe, expect, it } from "vitest";
import { noteColor, paintNote } from "./colors";

describe("cores das notas", () => {
  it("pinta, troca e tira a cor sem mexer nas outras notas", () => {
    const one = paintNote({}, "a.md", "blue");
    expect(one).toEqual({ "a.md": "blue" });
    const two = paintNote(one, "b.md", "green");
    expect(paintNote(two, "a.md", "pink")).toEqual({ "a.md": "pink", "b.md": "green" });
    expect(paintNote(two, "a.md", null)).toEqual({ "b.md": "green" });
    expect(one).toEqual({ "a.md": "blue" }); // não altera o mapa recebido
  });

  it("ignora nota sem cor e cor desconhecida", () => {
    expect(noteColor({ "a.md": "blue" }, "a.md")?.hex).toBe("#4c8dff");
    expect(noteColor({}, "a.md")).toBeNull();
    expect(noteColor({ "a.md": "magenta" }, "a.md")).toBeNull();
  });
});
