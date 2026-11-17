import { create } from "zustand";
import { useIslandStore } from "../island/store";
import { ipc, type Mic } from "../lib/ipc";

interface AudioStore {
  /** The default microphone; null when there is none (or before the first read). */
  mic: Mic | null;
}

export const useAudioStore = create<AudioStore>(() => ({ mic: null }));

const MIC_NOTICE_MS = 1800;

/** Keeps the microphone's state and shows the short notice whenever it is muted or unmuted. Call once, in the island. */
export function startAudioSync(): () => void {
  let alive = true;
  void ipc.audioState().then((state) => alive && useAudioStore.setState({ mic: state.mic }));
  const off = ipc.onMic((mic) => {
    useAudioStore.setState({ mic });
    useIslandStore.getState().showOverlay("mic", MIC_NOTICE_MS);
  });
  return () => {
    alive = false;
    off();
  };
}
