import { create } from "zustand";
import { useIslandStore } from "../island/store";
import { initialTimer, reset, setMode, tick, type TimerMode, type TimerState, toggle } from "./timer";

const FINISHED_NOTICE_MS = 4200;

interface FocusStore extends TimerState {
  /** Qual modo acabou de terminar (para o aviso da ilha). */
  finished: TimerMode | null;
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
        const { state, finished } = tick(get());
        set({ ...state, finished: finished ?? get().finished });
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
    toggle: () => apply(toggle(get())),
    reset: () => apply(reset(get())),
    setMode: (mode) => apply(setMode(get(), mode)),
  };
});
