import { describe, expect, it } from "vitest";
import { type CalEvent, groupByDay, timeRange, untilLabel, upcoming, waitProgress } from "./events";

const at = (h: number, m = 0, day = 2) => new Date(2026, 10, day, h, m).getTime();
const now = at(10, 0);
const event = (startMs: number, endMs = startMs + 3_600_000, extra: Partial<CalEvent> = {}): CalEvent => ({
  id: String(startMs),
  title: "x",
  startMs,
  endMs,
  allDay: false,
  location: null,
  meetUrl: null,
  ...extra,
});

describe("untilLabel", () => {
  it("minutos, horas, hoje, amanhã e data", () => {
    expect(untilLabel(event(at(10, 12)), now)).toBe("em 12 min");
    expect(untilLabel(event(at(10, 0) + 20_000), now)).toBe("em 1 min");
    expect(untilLabel(event(at(12, 0)), now)).toBe("em 2 h");
    expect(untilLabel(event(at(12, 30)), now)).toBe("em 2 h 30 min");
    expect(untilLabel(event(at(18, 30)), now)).toBe("hoje · 18:30");
    expect(untilLabel(event(at(9, 0, 3)), now)).toBe("amanhã · 09:00");
    expect(untilLabel(event(at(9, 0, 6)), now)).toBe("06 nov · 09:00");
  });

  it("já começou e dia todo", () => {
    expect(untilLabel(event(at(9, 30), at(10, 30)), now)).toBe("agora");
    expect(untilLabel(event(at(0, 0, 3), at(0, 0, 4), { allDay: true }), now)).toBe("dia todo");
  });
});

describe("upcoming", () => {
  it("tira os que acabaram e ordena por início", () => {
    const list = [event(at(15)), event(at(8), at(9)), event(at(11))];
    expect(upcoming(list, now).map((e) => e.startMs)).toEqual([at(11), at(15)]);
  });
});

describe("waitProgress", () => {
  it("vai de 0 a 1 nas duas horas antes do início", () => {
    expect(waitProgress(event(at(12)), now)).toBe(0);
    expect(waitProgress(event(at(11)), now)).toBeCloseTo(0.5);
    expect(waitProgress(event(at(10, 0) - 1), now)).toBe(1);
  });
});

describe("groupByDay e timeRange", () => {
  it("agrupa por dia, com Hoje e Amanhã", () => {
    const groups = groupByDay([event(at(11, 0)), event(at(15, 0)), event(at(9, 0, 3)), event(at(9, 0, 6))], now);
    expect(groups.map((g) => [g.label, g.events.length])).toEqual([
      ["Hoje", 2],
      ["Amanhã", 1],
      ["sexta, 06 nov", 1],
    ]);
  });

  it("evento de dia todo cai no dia da data, em qualquer fuso", () => {
    const allDay = event(Date.UTC(2026, 10, 3), Date.UTC(2026, 10, 4), { allDay: true });
    expect(groupByDay([allDay], now)[0].label).toBe("Amanhã");
    expect(groupByDay([], now)).toEqual([]);
  });

  it("mostra o horário de início e fim", () => {
    expect(timeRange(event(at(15, 30), at(16, 0)))).toBe("15:30 – 16:00");
    expect(timeRange(event(at(15, 30), at(15, 30)))).toBe("15:30");
    expect(timeRange(event(at(0, 0), at(0, 0, 3), { allDay: true }))).toBe("dia todo");
  });
});
