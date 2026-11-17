import { create } from "zustand";
import { useConfigStore } from "../config/useConfig";
import { playChime } from "../focus/chime";
import { type BatteryNotice, type Call, type DiscordState, type DownloadDone, type FullscreenSummary, ipc, type Reminder } from "../lib/ipc";
import { useIslandStore } from "./store";

const DOWNLOAD_NOTICE_MS = 6000;
const GAME_NOTICE_MS = 7000;
const HEADSET_NOTICE_MS = 4000;
/** A reminder stays on the pill longer: it is something you asked not to miss. */
const REMINDER_NOTICE_MS = 12000;

/** What the pill shows about the rest of the computer: a finished download, a call, the end of a game. */
interface ActivityStore {
  /** The download that just finished (for the notice). */
  finished: DownloadDone | null;
  call: Call | null;
  micMuted: boolean;
  /** The fullscreen session that just ended (for the notice). */
  game: FullscreenSummary | null;
  discord: DiscordState | null;
  /** Headphones that just connected or ran low (for the notice). */
  headset: BatteryNotice | null;
  /** Pending reminders, soonest first, and the one that just came due (for the notice). */
  reminders: Reminder[];
  reminder: Reminder | null;
  toggleMic: () => void;
}

/** In a Discord call that Docky can control (set up and authorized). */
export const inDiscordCall = (discord: DiscordState | null): discord is DiscordState => discord?.status === "ready" && !!discord.channel;

export const useActivityStore = create<ActivityStore>((set, get) => ({
  finished: null,
  call: null,
  micMuted: false,
  game: null,
  discord: null,
  headset: null,
  reminders: [],
  reminder: null,
  toggleMic: () => {
    const muted = !get().micMuted;
    ipc.setMicMuted(muted);
    set({ micMuted: muted });
  },
}));

/** Connects the Rust events to the store. Call once, in the island. */
export function startActivitySync(): () => void {
  const readMic = () => void ipc.micMuted().then((micMuted) => useActivityStore.setState({ micMuted }));
  void ipc.currentCall().then((call) => {
    useActivityStore.setState({ call });
    if (call) readMic();
  });
  void ipc.reminderList().then((reminders) => useActivityStore.setState({ reminders }));
  void ipc.discordState().then((discord) => useActivityStore.setState({ discord })).catch(() => {});
  const offs = [
    ipc.onDiscord((discord) => useActivityStore.setState({ discord })),
    ipc.onDownloadDone((finished) => {
      useActivityStore.setState({ finished });
      useIslandStore.getState().showOverlay("download", DOWNLOAD_NOTICE_MS);
    }),
    ipc.onReminders((reminders) => useActivityStore.setState({ reminders })),
    ipc.onReminder((reminder) => {
      useActivityStore.setState({ reminder });
      useIslandStore.getState().showOverlay("reminder", REMINDER_NOTICE_MS);
      // One chime, from the main screen's island only, if sounds are on.
      if (useConfigStore.getState().config.timerSound && document.body.dataset.window === "island") playChime();
    }),
    ipc.onBluetoothBattery((headset) => {
      useActivityStore.setState({ headset });
      useIslandStore.getState().showOverlay("bluetooth", HEADSET_NOTICE_MS);
    }),
    ipc.onCall((call) => {
      useActivityStore.setState({ call });
      if (call) readMic();
    }),
    ipc.onFullscreenSummary((game) => {
      useActivityStore.setState({ game });
      // The island comes back a moment after fullscreen ends; show the summary once it is there.
      setTimeout(() => useIslandStore.getState().showOverlay("game", GAME_NOTICE_MS), 600);
    }),
  ];
  return () => offs.forEach((off) => off());
}

/** "45 min", "1h 23min", "2h". */
export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const rest = minutes % 60;
  return rest === 0 ? `${Math.floor(minutes / 60)}h` : `${Math.floor(minutes / 60)}h ${rest}min`;
}

/** "04:12" or "1:04:12". */
export function formatElapsed(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const two = (n: number) => String(n).padStart(2, "0");
  return s >= 3600 ? `${Math.floor(s / 3600)}:${two(Math.floor((s % 3600) / 60))}:${two(s % 60)}` : `${two(Math.floor(s / 60))}:${two(s % 60)}`;
}
