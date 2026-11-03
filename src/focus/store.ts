import { create } from "zustand";
import { useConfigStore } from "../config/useConfig";
import type { Config } from "../config/types";
import { useIslandStore } from "../island/store";
import { applySettings, initialTimer, reset, setMode, tick, type TimerMode, type TimerSettings, type TimerState, toggle } from "./timer";

const FINISHED_NOTICE_MS = 4200;

/** Converte as configurações (em minutos) para o que o timer usa (em segundos). */
export function settingsFromConfig(config: Pick<Config, "focusMinutes" | "shortBreakMinutes" | "longBreakMinutes" | "focusPerSet" | "timerCustomMinutes">): TimerSettings {
  const seconds = (minutes: number) => Math.max(1, Math.round(minutes)) * 60;
  return {
    focus: seconds(config.focusMinutes),
    short: seconds(config.shortBreakMinutes),
    long: seconds(config.longBreakMinutes),
    custom: seconds(config.timerCustomMinutes),
    perSet: Math.max(1, Math.round(config.focusPerSet)),
  };
}

const currentSettings = () => settingsFromConfig(useConfigStore.getState().config);

interface FocusStore extends TimerState {
  /** Qual modo acabou de terminar (para o aviso da ilha). */
  finished: TimerMode | null;
  /** Quantos focos formam um ciclo, para a página mostrar "2 de 4". */
  perSet: number;
  toggle: () => void;
  reset: () => void;
  setMode: (mode: TimerMode) => void;
}

let interval: ReturnType<typeof setInterval> | undefined;

export const useFocusStore = create<FocusStore>((set, get) => {
  const sync = () => {
    const running = get().running;
    if (running && !interval) {
      interval = setInterval(() => {
        const settings = currentSettings();
        const { state, finished } = tick(get(), settings);
        set({ ...state, perSet: settings.perSet, finished: finished ?? get().finished });
        if (finished) useIslandStore.getState().showOverlay("timer", FINISHED_NOTICE_MS);
      }, 1000);
    } else if (!running && interval) {
      clearInterval(interval);
      interval = undefined;
    }
  };
  const apply = (next: TimerState) => {
    set(next);
    sync();
  };

  return {
    ...initialTimer,
    finished: null,
    perSet: currentSettings().perSet,
    toggle: () => apply(toggle(get())),
    reset: () => apply(reset(get())),
    setMode: (mode) => apply(setMode(get(), mode, currentSettings())),
  };
});

// Quando as durações mudam nas configurações, o timer parado já mostra o novo tempo.
useConfigStore.subscribe((state, previous) => {
  const a = settingsFromConfig(state.config);
  const b = settingsFromConfig(previous.config);
  if (a.focus === b.focus && a.short === b.short && a.long === b.long && a.custom === b.custom && a.perSet === b.perSet) return;
  const current = useFocusStore.getState();
  useFocusStore.setState({ ...applySettings(current, a), perSet: a.perSet });
});
