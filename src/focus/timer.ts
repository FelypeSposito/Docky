export type TimerMode = "focus" | "short" | "long";

/** Durações (em segundos) e quantos focos formam um ciclo; vêm das configurações. */
export interface TimerSettings {
  focus: number;
  short: number;
  long: number;
  perSet: number;
}

export const DEFAULT_SETTINGS: TimerSettings = { focus: 25 * 60, short: 5 * 60, long: 15 * 60, perSet: 4 };

/** Padrões, mantidos como constantes para quem só precisa deles. */
export const DURATIONS: Record<TimerMode, number> = { focus: DEFAULT_SETTINGS.focus, short: DEFAULT_SETTINGS.short, long: DEFAULT_SETTINGS.long };
export const FOCUS_PER_SET = DEFAULT_SETTINGS.perSet;
export const LABELS: Record<TimerMode, string> = { focus: "Foco", short: "Pausa", long: "Longa" };

export interface TimerState {
  mode: TimerMode;
  total: number;
  left: number;
  running: boolean;
  /** Focos completos no ciclo atual (0 até `perSet`). */
  cycle: number;
  /** Focos completos desde que o Docky abriu. */
  done: number;
}

export const initialTimer: TimerState = {
  mode: "focus",
  total: DEFAULT_SETTINGS.focus,
  left: DEFAULT_SETTINGS.focus,
  running: false,
  cycle: 0,
  done: 0,
};

export function setMode(state: TimerState, mode: TimerMode, settings: TimerSettings = DEFAULT_SETTINGS): TimerState {
  return { ...state, mode, total: settings[mode], left: settings[mode], running: false };
}

/** Aplica novas durações. Com o timer rodando elas só valem no próximo modo, para não mexer no que está contando. */
export function applySettings(state: TimerState, settings: TimerSettings): TimerState {
  if (state.running) return state;
  return { ...state, total: settings[state.mode], left: settings[state.mode] };
}

export const toggle = (state: TimerState): TimerState => ({ ...state, running: !state.running && state.left > 0 });

export const reset = (state: TimerState): TimerState => ({ ...state, left: state.total, running: false });

/**
 * Passa um segundo. Quando chega a zero, para e já deixa o próximo modo pronto
 * (foco → pausa, ou pausa longa depois do último foco do ciclo; pausa → foco).
 */
export function tick(state: TimerState, settings: TimerSettings = DEFAULT_SETTINGS): { state: TimerState; finished: TimerMode | null } {
  if (!state.running) return { state, finished: null };
  if (state.left > 1) return { state: { ...state, left: state.left - 1 }, finished: null };

  const finished = state.mode;
  if (finished !== "focus") {
    const next = setMode(state, "focus", settings);
    return { state: { ...next, cycle: finished === "long" ? 0 : state.cycle }, finished };
  }
  const cycle = state.cycle + 1;
  const setDone = cycle >= settings.perSet;
  const next = setMode(state, setDone ? "long" : "short", settings);
  return { state: { ...next, cycle: setDone ? settings.perSet : cycle, done: state.done + 1 }, finished };
}

export const clock = (seconds: number): string =>
  `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
