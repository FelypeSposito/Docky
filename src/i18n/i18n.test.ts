import { afterEach, describe, expect, it } from "vitest";
import { EN } from "./en";
import { plural, resolveLanguage, setLanguage, t } from "./index";

// setLanguage touches <html lang>; the tests run without a DOM.
globalThis.document ??= { documentElement: {} } as Document;

describe("resolveLanguage", () => {
  it("follows the system when automatic", () => {
    expect(resolveLanguage("auto", "pt-BR")).toBe("pt");
    expect(resolveLanguage("auto", "pt-PT")).toBe("pt");
    expect(resolveLanguage("auto", "en-US")).toBe("en");
    expect(resolveLanguage("auto", "es-ES")).toBe("en");
    expect(resolveLanguage(undefined, undefined)).toBe("en");
  });

  it("keeps a language that was picked", () => {
    expect(resolveLanguage("pt", "en-US")).toBe("pt");
    expect(resolveLanguage("en", "pt-BR")).toBe("en");
  });
});

describe("t", () => {
  afterEach(() => setLanguage("pt"));

  it("is the Portuguese itself in Portuguese, with the blanks filled", () => {
    setLanguage("pt");
    expect(t("Abrir no GitHub")).toBe("Abrir no GitHub");
    expect(t("há {n} min", { n: 5 })).toBe("há 5 min");
  });

  it("looks the phrase up in English, and falls back to Portuguese when it is missing", () => {
    setLanguage("en");
    expect(t("Abrir no GitHub")).toBe("Open on GitHub");
    expect(t("há {n} min", { n: 5 })).toBe("5 min ago");
    expect(t("Uma frase que ninguém traduziu")).toBe("Uma frase que ninguém traduziu");
  });

  it("picks singular or plural", () => {
    setLanguage("en");
    expect(plural(1, "1 resultado", "{n} resultados")).toBe("1 result");
    expect(plural(4, "1 resultado", "{n} resultados")).toBe("4 results");
  });
});

describe("the English dictionary", () => {
  it("keeps every {placeholder} of the Portuguese phrase", () => {
    const blanks = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort().join();
    for (const [pt, en] of Object.entries(EN)) expect(blanks(en), pt).toBe(blanks(pt));
  });
});
