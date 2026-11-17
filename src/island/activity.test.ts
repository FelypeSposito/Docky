import { describe, expect, it, vi } from "vitest";

vi.mock("../lib/ipc", () => ({ ipc: {} }));
vi.mock("./store", () => ({ useIslandStore: { getState: () => ({}) } }));

const { formatBytes, formatElapsed, formatMinutes } = await import("./activity");

describe("textos da pílula", () => {
  it("tamanhos de download", () => {
    expect(formatBytes(820 * 1024)).toBe("820 KB");
    expect(formatBytes(340 * 1024 ** 2)).toBe("340 MB");
    expect(formatBytes(1.24 * 1024 ** 3)).toBe("1,2 GB");
    expect(formatBytes(10)).toBe("1 KB");
  });

  it("tempo de jogo", () => {
    expect(formatMinutes(45)).toBe("45 min");
    expect(formatMinutes(83)).toBe("1h 23min");
    expect(formatMinutes(120)).toBe("2h");
  });

  it("tempo de chamada", () => {
    expect(formatElapsed(252)).toBe("04:12");
    expect(formatElapsed(3852)).toBe("1:04:12");
  });
});
