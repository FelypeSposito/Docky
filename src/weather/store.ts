import { create } from "zustand";
import { ipc, type Weather } from "../lib/ipc";

const MAX_AGE_MS = 15 * 60 * 1000;

interface WeatherStore {
  city: string;
  weather: Weather | null;
  error: string | null;
  loading: boolean;
  fetchedAt: number;
  /** Busca de novo se a cidade mudou ou o dado tem mais de 15 minutos. */
  load: (city: string) => Promise<void>;
}

export const useWeatherStore = create<WeatherStore>((set, get) => ({
  city: "",
  weather: null,
  error: null,
  loading: false,
  fetchedAt: 0,

  load: async (city) => {
    const trimmed = city.trim();
    const state = get();
    if (state.loading) return;
    if (!trimmed) return set({ city: "", weather: null, error: null });
    if (trimmed === state.city && state.weather && Date.now() - state.fetchedAt < MAX_AGE_MS) return;

    set({ loading: true, error: null, city: trimmed });
    try {
      set({ weather: await ipc.weather(trimmed), fetchedAt: Date.now(), loading: false });
    } catch (e) {
      set({ weather: null, error: e instanceof Error ? e.message : String(e), loading: false });
    }
  },
}));
