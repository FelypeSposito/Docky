export type TimerMode = "focus" | "short" | "long";

export const DURATIONS: Record<TimerMode, number> = { focus: 25 * 60, short: 5 * 60, long: 15 * 60 };
export const LABELS: Record<TimerMode, string> = { focus: "Foco", short: "Pausa", long: "Longa" };

/** Quantos focos completam um ciclo; depois deles vem a pausa longa. */
export const FOCUS_PER_SET = 4;

export interface TimerState {
  mode: TimerMode;
  total: number;
  left: number;
  running: boolean;
  /** Focos completos no ciclo atual (0 a 3). */
  cycle: number;
  /** Focos completos desde que o Docky abriu. */
  done: number;
}

export const initialTimer: TimerState = {
  mode: "focus",
  total: DURATIONS.focus,
  left: DURATIONS.focus,
  running: false,
  cycle: 0,
  done: 0,
};

export function setMode(state: TimerState, mode: TimerMode): TimerState {
  return { ...state, mode, total: DURATIONS[mode], left: DURATIONS[mode], running: false };
}

export const toggle = (state: TimerState): TimerState => ({ ...state, running: !state.running && state.left > 0 });

export const reset = (state: TimerState): TimerState => ({ ...state, left: state.total, running: false });

/**
 * Passa um segundo. Quando chega a zero, para e já deixa o próximo modo pronto
 * (foco → pausa, ou pausa longa depois do quarto foco; pausa → foco).
 */
export function tick(state: TimerState): { state: TimerState; finished: TimerMode | null } {
  if (!state.running) return { state, finished: null };
  if (state.left > 1) return { state: { ...state, left: state.left - 1 }, finished: null };

  const finished = state.mode;
  if (finished !== "focus") {
    const next = setMode(state, "focus");
    return { state: { ...next, cycle: finished === "long" ? 0 : state.cycle }, finished };
  }
  const cycle = state.cycle + 1;
  const next = setMode(state, cycle >= FOCUS_PER_SET ? "long" : "short");
  return { state: { ...next, cycle: cycle >= FOCUS_PER_SET ? FOCUS_PER_SET : cycle, done: state.done + 1 }, finished };
}

export const clock = (seconds: number): string =>
  `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
