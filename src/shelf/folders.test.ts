import { describe, expect, it } from "vitest";
import { folderHint, usableFolders } from "./folders";

describe("pastas da Shelf", () => {
  it("ignora as incompletas e as repetidas", () => {
    const list = [
      { name: "teste", path: "" },
      { name: "teste", path: "C:\\Users\\a\\Desktop\\TESTE" },
      { name: "outro", path: "c:\\users\\a\\desktop\\teste\\" },
      { name: "", path: "C:\\x" },
      { name: "Faculdade", path: "C:\\Drive\\Faculdade 2026" },
    ];
    expect(usableFolders(list).map((f) => f.name)).toEqual(["teste", "Faculdade"]);
  });

  it("mostra o nome da pasta ou, se for o mesmo do atalho, onde ela está", () => {
    expect(folderHint({ name: "Faculdade", path: "C:\\Drive\\Faculdade 2026" })).toBe("Faculdade 2026");
    expect(folderHint({ name: "teste", path: "C:\\Users\\a\\OneDrive\\Área de Trabalho\\TESTE" })).toBe("em Área de Trabalho");
    expect(folderHint({ name: "D", path: "D:\\" })).toBe("D:");
  });
});
