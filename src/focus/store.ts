import { create } from "zustand";
import { useConfigStore } from "../config/useConfig";
import type { Config } from "../config/types";
import { useIslandStore } from "../island/store";
import { ipc } from "../lib/ipc";
import { playChime } from "./chime";
import { applySettings, initialTimer, reset, setMode, tick, type TimerMode, type TimerSettings, type TimerState, toggle } from "./timer";

const FINISHED_NOTICE_MS = 7000;

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
  /** Recebe o estado de outra janela da ilha (outra tela). Não avisa de volta, para não virar eco. */
  receive: (state: TimerState) => void;
}

/** O Foco é um só, mesmo com a ilha em várias telas: cada janela avisa as outras do que muda. */
const windowLabel = (): string => {
  const tauri = (window as unknown as { __TAURI_INTERNALS__?: { metadata?: { currentWindow?: { label?: string } } } }).__TAURI_INTERNALS__;
  return tauri?.metadata?.currentWindow?.label ?? document.body.dataset.window ?? "island";
};
const pickTimer = (s: TimerState): TimerState => ({ mode: s.mode, total: s.total, left: s.left, running: s.running, cycle: s.cycle, done: s.done });

let interval: ReturnType<typeof setInterval> | undefined;

export const useFocusStore = create<FocusStore>((set, get) => {
  const sync = () => {
    const running = get().running;
    if (running && !interval) {
      interval = setInterval(() => {
        const settings = currentSettings();
        const { state, finished } = tick(get(), settings);
        set({ ...state, perSet: settings.perSet, finished: finished ?? get().finished });
        if (finished) {
          useIslandStore.getState().showOverlay("timer", FINISHED_NOTICE_MS);
          // Com a ilha em várias telas, só a principal toca, para o som não sair repetido.
          if (useConfigStore.getState().config.timerSound && windowLabel() === "island") playChime();
        }
      }, 1000);
    } else if (!running && interval) {
      clearInterval(interval);
      interval = undefined;
    }
  };
  const broadcast = () => ipc.emitTimer({ from: windowLabel(), state: pickTimer(get()) });
  const apply = (next: TimerState) => {
    set(next);
    sync();
    broadcast();
  };

  return {
    ...initialTimer,
    finished: null,
    perSet: currentSettings().perSet,
    toggle: () => apply(toggle(get())),
    reset: () => apply(reset(get())),
    setMode: (mode) => apply(setMode(get(), mode, currentSettings())),
    receive: (state) => {
      set(state);
      sync();
    },
  };
});

// Outras telas: aplica o que elas mudam e responde ao "oi" de uma janela que acabou de abrir.
ipc.onTimer((payload) => {
  const message = payload as { from?: string; state?: TimerState; hello?: boolean } | null;
  if (!message || message.from === windowLabel()) return;
  if (message.hello) ipc.emitTimer({ from: windowLabel(), state: pickTimer(useFocusStore.getState()) });
  else if (message.state) useFocusStore.getState().receive(message.state);
});
// Quem abre depois (uma tela ligada com o Foco rodando) pergunta como está.
ipc.emitTimer({ from: windowLabel(), hello: true });

// Quando as durações mudam nas configurações, o timer parado já mostra o novo tempo.
useConfigStore.subscribe((state, previous) => {
  const a = settingsFromConfig(state.config);
  const b = settingsFromConfig(previous.config);
  if (a.focus === b.focus && a.short === b.short && a.long === b.long && a.custom === b.custom && a.perSet === b.perSet) return;
  const current = useFocusStore.getState();
  useFocusStore.setState({ ...applySettings(current, a), perSet: a.perSet });
});
