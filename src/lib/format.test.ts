import { describe, expect, it } from "vitest";
import { formatClock, formatDate, formatNoteDate } from "./format";

describe("format", () => {
  it("formata a hora com zero à esquerda", () => {
    expect(formatClock(new Date(2026, 9, 30, 7, 5))).toBe("07:05");
    expect(formatClock(new Date(2026, 9, 30, 22, 1))).toBe("22:01");
  });

  it("formata a data em português", () => {
    expect(formatDate(new Date(2026, 9, 30))).toBe("sex 30 out 2026");
    expect(formatDate(new Date(2026, 0, 4))).toBe("dom 04 jan 2026");
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
