import { describe, expect, it } from "vitest";
import { folderHint, reorderFolders, usableFolders } from "./folders";

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

  it("reordena as que aparecem e deixa as outras no lugar", () => {
    const list = [
      { name: "A", path: "C:\\a" },
      { name: "", path: "C:\\vazia" },
      { name: "B", path: "C:\\b" },
      { name: "C", path: "C:\\c" },
    ];
    // Na tela aparecem as posições 0, 2 e 3; arrastar a C para o começo.
    expect(reorderFolders(list, [3, 0, 2]).map((f) => f.name)).toEqual(["C", "", "A", "B"]);
  });

  it("mostra o nome da pasta ou, se for o mesmo do atalho, onde ela está", () => {
    expect(folderHint({ name: "Faculdade", path: "C:\\Drive\\Faculdade 2026" })).toBe("Faculdade 2026");
    expect(folderHint({ name: "teste", path: "C:\\Users\\a\\OneDrive\\Área de Trabalho\\TESTE" })).toBe("em Área de Trabalho");
    expect(folderHint({ name: "D", path: "D:\\" })).toBe("D:");
  });
});
