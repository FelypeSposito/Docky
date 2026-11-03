import { describe, expect, it } from "vitest";
import { orderNotes, togglePinned } from "./order";

const notes = ["a.md", "b.md", "c.md", "d.md"].map((file) => ({ file }));

describe("ordem das notas", () => {
  it("põe as fixadas no topo e mantém a ordem dos dois grupos", () => {
    expect(orderNotes(notes, ["c.md", "b.md"]).map((n) => n.file)).toEqual(["b.md", "c.md", "a.md", "d.md"]);
  });

  it("sem fixadas, nada muda; fixada que não existe mais é ignorada", () => {
    expect(orderNotes(notes, [])).toEqual(notes);
    expect(orderNotes(notes, ["sumiu.md"])).toEqual(notes);
  });

  it("fixa e desafixa", () => {
    expect(togglePinned([], "a.md")).toEqual(["a.md"]);
    expect(togglePinned(["a.md", "b.md"], "a.md")).toEqual(["b.md"]);
  });
});
