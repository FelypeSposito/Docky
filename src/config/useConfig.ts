import { useEffect } from "react";
import { create } from "zustand";
import { ipc } from "../lib/ipc";
import { type Config, DEFAULT_CONFIG } from "./types";

interface ConfigStore {
  config: Config;
  loaded: boolean;
  update: (patch: Partial<Config>) => void;
}

export const useConfigStore = create<ConfigStore>((set, get) => ({
  config: DEFAULT_CONFIG,
  loaded: false,
  update: (patch) => {
    const next = { ...get().config, ...patch };
    set({ config: next }); // otimista; o Rust confirma pelo evento `config-changed`
    void ipc.setConfig(next);
  },
}));

/** Carrega a configuração e a mantém sincronizada entre as janelas. Chame uma vez por janela. */
export function useConfigSync(): void {
  useEffect(() => {
    let alive = true;
    void ipc.getConfig().then((config) => alive && useConfigStore.setState({ config, loaded: true }));
    const off = ipc.onConfig((config) => useConfigStore.setState({ config }));
    return () => {
      alive = false;
      off();
    };
  }, []);
}
