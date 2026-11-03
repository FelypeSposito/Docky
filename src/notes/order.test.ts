import { describe, expect, it } from "vitest";
import { nextNoteOrder, orderNotes, splitNotes, togglePinned } from "./order";

const notes = ["a.md", "b.md", "c.md", "d.md"].map((file) => ({ file }));

describe("ordem das notas", () => {
  it("põe as fixadas no topo e mantém a ordem dos dois grupos", () => {
    expect(orderNotes(notes, ["c.md", "b.md"]).map((n) => n.file)).toEqual(["b.md", "c.md", "a.md", "d.md"]);
  });

  it("sem fixadas, nada muda; fixada que não existe mais é ignorada", () => {
    expect(orderNotes(notes, [])).toEqual(notes);
    expect(orderNotes(notes, ["sumiu.md"])).toEqual(notes);
  });

  it("segue a ordem escolhida arrastando e põe as notas novas no topo", () => {
    // d.md e a.md já foram ordenadas (d antes de a); b.md e c.md são novas e vêm primeiro, como chegaram.
    expect(orderNotes(notes, [], ["d.md", "a.md"]).map((n) => n.file)).toEqual(["b.md", "c.md", "d.md", "a.md"]);
  });

  it("a ordem escolhida vale dentro de cada grupo, sem misturar fixadas e outras", () => {
    const { pinned, rest } = splitNotes(notes, ["a.md", "c.md"], ["c.md", "a.md", "d.md", "b.md"]);
    expect(pinned.map((n) => n.file)).toEqual(["c.md", "a.md"]);
    expect(rest.map((n) => n.file)).toEqual(["d.md", "b.md"]);
  });

  it("a ordem a guardar junta os dois grupos e tem limite", () => {
    expect(nextNoteOrder(["c.md"], ["a.md", "b.md"])).toEqual(["c.md", "a.md", "b.md"]);
    expect(nextNoteOrder(Array.from({ length: 500 }, (_, i) => `${i}.md`), [])).toHaveLength(400);
  });

  it("fixa e desafixa", () => {
    expect(togglePinned([], "a.md")).toEqual(["a.md"]);
    expect(togglePinned(["a.md", "b.md"], "a.md")).toEqual(["b.md"]);
  });
});
