import { describe, expect, it } from "vitest";
import { applySettings, clock, DURATIONS, FOCUS_PER_SET, initialTimer, reset, setMode, tick, toggle, type TimerState } from "./timer";

const running = (s: TimerState): TimerState => toggle(s);

describe("timer", () => {
  it("só conta quando está rodando", () => {
    expect(tick(initialTimer).state).toBe(initialTimer);
    const { state } = tick(running(initialTimer));
    expect(state.left).toBe(DURATIONS.focus - 1);
  });

  it("pausa e reinicia", () => {
    let s = running(initialTimer);
    s = tick(s).state;
    s = toggle(s);
    expect(s.running).toBe(false);
    expect(reset(s).left).toBe(DURATIONS.focus);
  });

  it("ao acabar o foco, para e prepara a pausa curta", () => {
    const almost: TimerState = { ...running(initialTimer), left: 1 };
    const { state, finished } = tick(almost);
    expect(finished).toBe("focus");
    expect(state).toMatchObject({ mode: "short", running: false, cycle: 1, done: 1, left: DURATIONS.short });
  });

  it("depois do quarto foco vem a pausa longa, e depois dela o ciclo recomeça", () => {
    let s: TimerState = { ...running(initialTimer), left: 1, cycle: FOCUS_PER_SET - 1 };
    s = tick(s).state;
    expect(s.mode).toBe("long");
    expect(s.cycle).toBe(FOCUS_PER_SET);
    s = { ...running(s), left: 1 };
    const after = tick(s);
    expect(after.finished).toBe("long");
    expect(after.state).toMatchObject({ mode: "focus", cycle: 0 });
  });

  it("trocar de modo para o relógio", () => {
    const s = setMode(running(initialTimer), "long");
    expect(s).toMatchObject({ mode: "long", running: false, left: DURATIONS.long });
  });

  it("formata mm:ss", () => {
    expect(clock(1500)).toBe("25:00");
    expect(clock(61)).toBe("01:01");
  });
});

describe("configurações do timer", () => {
  const custom = { focus: 50 * 60, short: 10 * 60, long: 30 * 60, perSet: 2 };

  it("usa as durações e o tamanho do ciclo configurados", () => {
    const s = setMode(initialTimer, "focus", custom);
    expect(s.left).toBe(custom.focus);
    let state: TimerState = { ...toggle(s), left: 1 };
    state = tick(state, custom).state;
    expect(state).toMatchObject({ mode: "short", left: custom.short, cycle: 1 });
    state = { ...toggle(state), left: 1 };
    state = tick(state, custom).state;
    state = { ...toggle(state), left: 1 };
    const afterSecondFocus = tick({ ...state, mode: "focus", cycle: 1 }, custom).state;
    expect(afterSecondFocus).toMatchObject({ mode: "long", left: custom.long, cycle: 2 });
  });

  it("applySettings muda o tempo só com o timer parado", () => {
    expect(applySettings(initialTimer, custom).left).toBe(custom.focus);
    const running = toggle(initialTimer);
    expect(applySettings(running, custom)).toBe(running);
  });
});
