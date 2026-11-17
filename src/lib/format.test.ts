import { describe, expect, it } from "vitest";
import { formatAgo, formatClock, formatDate, formatNoteDate } from "./format";

describe("format", () => {
  it("formata a hora com zero à esquerda", () => {
    expect(formatClock(new Date(2026, 9, 30, 7, 5))).toBe("07:05");
    expect(formatClock(new Date(2026, 9, 30, 22, 1))).toBe("22:01");
  });

  it("formata a hora de 12 horas sem zero à esquerda", () => {
    expect(formatClock(new Date(2026, 9, 30, 22, 1), true)).toBe("10:01");
    expect(formatClock(new Date(2026, 9, 30, 0, 5), true)).toBe("12:05");
    expect(formatClock(new Date(2026, 9, 30, 12, 30), true)).toBe("12:30");
    expect(formatClock(new Date(2026, 9, 30, 7, 5), true)).toBe("7:05");
  });

  it("formata a data em português", () => {
    expect(formatDate(new Date(2026, 9, 30))).toBe("sex 30 out 2026");
    expect(formatDate(new Date(2026, 0, 4))).toBe("dom 04 jan 2026");
  });
});

describe("formatAgo", () => {
  const now = new Date(2026, 9, 31, 18, 0);
  const ago = (minutes: number) => now.getTime() - minutes * 60_000;

  it("diz agora, minutos ou horas", () => {
    expect(formatAgo(ago(0.5), now)).toBe("agora");
    expect(formatAgo(ago(5), now)).toBe("há 5 min");
    expect(formatAgo(ago(59), now)).toBe("há 59 min");
    expect(formatAgo(ago(125), now)).toBe("há 2 h");
  });

  it("depois de um dia, mostra a data", () => {
    expect(formatAgo(ago(26 * 60), now)).toBe("ontem · 16:00");
  });

  it("um relógio adiantado não vira tempo negativo", () => {
    expect(formatAgo(now.getTime() + 60_000, now)).toBe("agora");
  });
});

describe("formatNoteDate", () => {
  const now = new Date(2026, 9, 31, 18, 0);

  it("diz hoje, ontem ou a data", () => {
    expect(formatNoteDate(new Date(2026, 9, 31, 16, 30).getTime(), now)).toBe("hoje · 16:30");
    expect(formatNoteDate(new Date(2026, 9, 30, 9, 5).getTime(), now)).toBe("ontem · 09:05");
    expect(formatNoteDate(new Date(2026, 9, 28, 18, 10).getTime(), now)).toBe("28 out · 18:10");
  });

  it("não confunde ontem à noite com hoje por causa das horas", () => {
    expect(formatNoteDate(new Date(2026, 9, 30, 23, 59).getTime(), new Date(2026, 9, 31, 0, 5))).toBe("ontem · 23:59");
  });
});
