import type { Config } from "../config/types";
import type { Overlay } from "./modes";

/** Cada aviso curto da ilha tem um interruptor nas configurações. */
export function noticeEnabled(overlay: Overlay, config: Pick<Config, "noticeCharge" | "noticeVolume" | "noticeClaudeDone" | "noticeTimer">): boolean {
  switch (overlay) {
    case "charge":
      return config.noticeCharge;
    case "volume":
      return config.noticeVolume;
    case "done":
      return config.noticeClaudeDone;
    case "timer":
      return config.noticeTimer;
  }
}
