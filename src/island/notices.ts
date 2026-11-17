import type { Config } from "../config/types";
import type { Overlay } from "./modes";

/** Cada aviso curto da ilha tem um interruptor nas configurações. */
export function noticeEnabled(overlay: Overlay, config: Pick<Config, "noticeCharge" | "noticeVolume" | "noticeClaudeDone" | "noticeTimer" | "noticeGame" | "noticeDownload" | "noticeBluetooth">): boolean {
  switch (overlay) {
    case "charge":
      return config.noticeCharge;
    case "volume":
    case "mic": // the microphone shares the volume switch: both are "sound changed" notices
      return config.noticeVolume;
    case "done":
      return config.noticeClaudeDone;
    case "timer":
      return config.noticeTimer;
    case "game":
      return config.noticeGame;
    case "download":
      return config.noticeDownload;
    case "bluetooth":
      return config.noticeBluetooth;
    case "reminder":
      // You asked for it: a reminder always shows.
      return true;
  }
}
