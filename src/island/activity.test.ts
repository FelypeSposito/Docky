import { describe, expect, it, vi } from "vitest";

vi.mock("../lib/ipc", () => ({ ipc: {} }));
vi.mock("./store", () => ({ useIslandStore: { getState: () => ({}) } }));

const { formatElapsed, formatMinutes } = await import("./activity");

describe("textos da pílula", () => {
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
