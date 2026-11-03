import { describe, expect, it } from "vitest";
import { iconKind, iconText } from "./icons";

describe("ícone do atalho", () => {
  it("vazio vale a inicial do nome", () => {
    expect(iconKind("")).toBe("none");
    expect(iconKind("   ")).toBe("none");
  });

  it("reconhece o caminho de uma imagem", () => {
    expect(iconKind("C:\\Icones\\git.PNG")).toBe("image");
    expect(iconKind("/home/x/logo.svg")).toBe("image");
    expect(iconKind("logo.webp")).toBe("image");
  });

  it("emoji e texto curto são texto", () => {
    expect(iconKind("🚀")).toBe("text");
    expect(iconKind("GH")).toBe("text");
  });

  it("um caminho que não é imagem não vira ícone", () => {
    expect(iconKind("C:\\Windows\\system.ini")).toBe("none");
    expect(iconKind("C:\\Apps\\app.exe")).toBe("none");
  });

  it("corta o texto em dois símbolos sem quebrar emoji", () => {
    expect(iconText("GitHub")).toBe("Gi");
    expect(iconText("🚀")).toBe("🚀");
    expect(iconText("👨‍👩‍👧x")).toBe("👨‍👩‍👧x");
  });
});
