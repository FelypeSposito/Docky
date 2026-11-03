import { describe, expect, it } from "vitest";
import { claudeBadge, resolveMode } from "./modes";

const base = { expanded: false, overlay: null, lyricActive: false, claude: null } as const;

describe("resolveMode", () => {
  it("fica recolhida sem eventos", () => {
    expect(resolveMode(base)).toBe("idle");
  });

  it("mostra a letra na pílula quando há letra ativa", () => {
    expect(resolveMode({ ...base, lyricActive: true })).toBe("lyric");
  });

  it("um aviso tem prioridade sobre a letra", () => {
    expect(resolveMode({ ...base, overlay: "charge", lyricActive: true })).toBe("charge");
    expect(resolveMode({ ...base, overlay: "volume", lyricActive: true })).toBe("volume");
    expect(resolveMode({ ...base, overlay: "done" })).toBe("done");
  });

  it("o Claude trabalhando vence o relógio, mas não um aviso nem a ilha aberta", () => {
    expect(resolveMode({ ...base, claude: "work" })).toBe("work");
    expect(resolveMode({ ...base, claude: "work", overlay: "volume" })).toBe("volume");
    expect(resolveMode({ ...base, claude: "work", expanded: true })).toBe("expanded");
  });

  it("com letra ativa, a letra continua e o Claude vira só um selo no canto", () => {
    expect(resolveMode({ ...base, claude: "work", lyricActive: true })).toBe("lyric");
    expect(claudeBadge("lyric", "work")).toBe(true);
    expect(claudeBadge("lyric", null)).toBe(false);
    expect(claudeBadge("work", "work")).toBe(false);
    expect(claudeBadge("idle", "work")).toBe(false);
  });

  it("um pedido de permissão vence tudo, até a ilha aberta", () => {
    expect(resolveMode({ expanded: true, overlay: "charge", lyricActive: true, claude: "ask" })).toBe("ask");
  });
});
