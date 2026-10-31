import { describe, expect, it } from "vitest";
import { formatClock, formatDate } from "./format";

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
