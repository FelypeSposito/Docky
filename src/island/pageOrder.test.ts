import { describe, expect, it } from "vitest";
import { moveItem, orderPages } from "./pageOrder";

const pages = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
const ids = (list: { id: string }[]) => list.map((p) => p.id);

describe("orderPages", () => {
  it("sem ordem guardada, mantém a original", () => {
    expect(ids(orderPages(pages, []))).toEqual(["a", "b", "c", "d"]);
  });

  it("aplica a ordem guardada", () => {
    expect(ids(orderPages(pages, ["c", "a", "d", "b"]))).toEqual(["c", "a", "d", "b"]);
  });

  it("páginas novas vão para o fim e ids antigos são ignorados", () => {
    expect(ids(orderPages(pages, ["c", "velha", "a"]))).toEqual(["c", "a", "b", "d"]);
  });

  it("não repete páginas se o id aparece duas vezes", () => {
    expect(ids(orderPages(pages, ["b", "b"]))).toEqual(["b", "a", "c", "d"]);
  });
});

describe("moveItem", () => {
  it("move para frente e para trás", () => {
    expect(moveItem(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveItem(["a", "b", "c", "d"], 3, 1)).toEqual(["a", "d", "b", "c"]);
  });

  it("devolve a mesma lista quando nada muda", () => {
    const list = ["a", "b"];
    expect(moveItem(list, 1, 1)).toBe(list);
    expect(moveItem(list, 5, 0)).toBe(list);
  });

  it("não deixa o destino sair da lista", () => {
    expect(moveItem(["a", "b", "c"], 0, 99)).toEqual(["b", "c", "a"]);
  });
});
