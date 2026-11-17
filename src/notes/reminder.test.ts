import { describe, expect, it } from "vitest";
import { formatWhen, parseReminder } from "./reminder";

const now = new Date(2026, 10, 17, 18, 30, 0);
const minutesFromNow = (r: { at: number } | null) => (r ? Math.round((r.at - now.getTime()) / 60_000) : null);

describe("parseReminder", () => {
  it("entende minutos", () => {
    expect(parseReminder("15 min tirar a pizza", now)).toEqual({ at: now.getTime() + 15 * 60_000, text: "tirar a pizza" });
    expect(minutesFromNow(parseReminder("em 5min café", now))).toBe(5);
    expect(minutesFromNow(parseReminder("40 minutos alongar", now))).toBe(40);
  });

  it("entende horas, com ou sem minutos", () => {
    expect(minutesFromNow(parseReminder("em 2h ligar pro banco", now))).toBe(120);
    expect(minutesFromNow(parseReminder("1h30 reunião", now))).toBe(90);
    expect(minutesFromNow(parseReminder("1 hora sair", now))).toBe(60);
  });

  it("entende um horário, hoje ou amanhã se já passou", () => {
    const today = parseReminder("às 19h buscar as crianças", now);
    expect(today?.text).toBe("buscar as crianças");
    expect(new Date(today!.at).getHours()).toBe(19);
    const tomorrow = parseReminder("as 9:30 dentista", now);
    expect(new Date(tomorrow!.at).getDate()).toBe(18);
    expect(new Date(tomorrow!.at).getMinutes()).toBe(30);
  });

  it("sem tempo no começo, ou sem texto, é só uma nota", () => {
    expect(parseReminder("comprar pão", now)).toBeNull();
    expect(parseReminder("15 min", now)).toBeNull();
    expect(parseReminder("2 maçãs e 3 peras", now)).toBeNull();
    expect(parseReminder("às 25h algo", now)).toBeNull();
    expect(parseReminder("3000 min longe demais", now)).toBeNull();
    expect(parseReminder("0 min agora", now)).toBeNull();
  });
});

describe("formatWhen", () => {
  it("mostra a hora, e amanhã quando não é hoje", () => {
    expect(formatWhen(new Date(2026, 10, 17, 18, 45).getTime(), now)).toBe("18:45");
    expect(formatWhen(new Date(2026, 10, 18, 9, 5).getTime(), now)).toBe("amanhã 09:05");
    expect(formatWhen(new Date(2026, 10, 17, 18, 45).getTime(), now, true)).toBe("6:45");
  });
});
