import { describe, expect, it } from "vitest";
import { noticeEnabled } from "./notices";

const all = { noticeCharge: true, noticeVolume: true, noticeClaudeDone: true, noticeTimer: true };

describe("noticeEnabled", () => {
  it("cada aviso segue o seu interruptor", () => {
    expect(noticeEnabled("charge", all)).toBe(true);
    expect(noticeEnabled("volume", { ...all, noticeVolume: false })).toBe(false);
    expect(noticeEnabled("done", { ...all, noticeClaudeDone: false })).toBe(false);
    expect(noticeEnabled("timer", { ...all, noticeTimer: false })).toBe(false);
  });

  it("desligar um não afeta os outros", () => {
    const config = { ...all, noticeVolume: false };
    expect(noticeEnabled("charge", config)).toBe(true);
    expect(noticeEnabled("timer", config)).toBe(true);
  });
});
