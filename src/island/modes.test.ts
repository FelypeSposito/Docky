import { describe, expect, it } from "vitest";
import { resolveMode } from "./modes";

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

  it("o Claude trabalhando vence a letra, mas não um aviso nem a ilha aberta", () => {
    expect(resolveMode({ ...base, claude: "work", lyricActive: true })).toBe("work");
    expect(resolveMode({ ...base, claude: "work", overlay: "volume" })).toBe("volume");
    expect(resolveMode({ ...base, claude: "work", expanded: true })).toBe("expanded");
  });

  it("um pedido de permissão vence tudo, até a ilha aberta", () => {
    expect(resolveMode({ expanded: true, overlay: "charge", lyricActive: true, claude: "ask" })).toBe("ask");
  });
});
