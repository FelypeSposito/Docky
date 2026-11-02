import { create } from "zustand";
import { ipc } from "../lib/ipc";
import type { CalEvent } from "./events";

const MAX_AGE_MS = 5 * 60 * 1000;

export interface CalendarStatus {
  /** Tem Client ID e segredo cadastrados, então dá para conectar. */
  configured: boolean;
  /** Já fez o login. */
  connected: boolean;
  secretSaved: boolean;
}

interface CalendarStore {
  status: CalendarStatus | null;
  events: CalEvent[];
  error: string | null;
  loading: boolean;
  fetchedAt: number;
  /** Atualiza o estado da conexão e, se conectado, os eventos (no máximo a cada 5 minutos, a não ser que `force`). */
  load: (force?: boolean) => Promise<void>;
}

export const useCalendarStore = create<CalendarStore>((set, get) => ({
  status: null,
  events: [],
  error: null,
  loading: false,
  fetchedAt: 0,

  load: async (force = false) => {
    if (get().loading) return;
    set({ loading: true });
    try {
      const status = await ipc.calendarStatus();
      if (!status.connected) return set({ status, events: [], error: null, loading: false });
      if (!force && get().status?.connected && Date.now() - get().fetchedAt < MAX_AGE_MS) return set({ status, loading: false });
      set({ status, events: await ipc.calendarEvents(), error: null, fetchedAt: Date.now(), loading: false });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e), loading: false });
    }
  },
}));
