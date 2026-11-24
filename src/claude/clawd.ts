import buildingSvg from "../assets/clawd/clawd-working-building.svg";
import delegateSvg from "../assets/clawd/clawd-working-juggling.svg";
import readingSvg from "../assets/clawd/clawd-working-reviewing.svg";
import thinkingSvg from "../assets/clawd/clawd-working-thinking.svg";
import toolSvg from "../assets/clawd/clawd-working-tool-calling.svg";
import waitSvg from "../assets/clawd/clawd-notification.svg";
import idleSvg from "../assets/clawd/clawd-idle-living.svg";
import coffeeSvg from "../assets/clawd/clawd-coffee.svg";
import yogaSvg from "../assets/clawd/clawd-yoga.svg";
import dancingSvg from "../assets/clawd/clawd-dancing.svg";
import sleepingSvg from "../assets/clawd/clawd-sleeping.svg";
import { type Session, type WorkKind, workKind } from "./sessions";

/**
 * Clawd while Claude Code works (clawd-pet animated SVGs, MIT; see src/assets/clawd/README.md): one animation per
 * kind of work, with the words the island uses for it.
 */
export const WORK_CLAWD: Record<WorkKind, { src: string; label: string; doing: string }> = {
  think: { src: thinkingSvg, label: "Clawd pensando", doing: "pensando" },
  edit: { src: buildingSvg, label: "Clawd construindo", doing: "escrevendo código" },
  run: { src: toolSvg, label: "Clawd rodando comandos", doing: "rodando comandos" },
  read: { src: readingSvg, label: "Clawd lendo", doing: "lendo o projeto" },
  delegate: { src: delegateSvg, label: "Clawd com subagentes", doing: "com subagentes" },
};

/** Clawd waving for you: a session waits for your permission. */
export const WAIT_CLAWD = waitSvg;

export interface RestingClawd {
  src: string;
  /** What he is doing, for the tooltip (Portuguese; the island translates it). */
  title: string;
}

const IDLE: RestingClawd = { src: idleSvg, title: "O Clawd de bobeira" };
/**
 * Clawd with nothing to do (no music, Claude Code idle), in place of the eyes: a calm day that changes every minute,
 * looking around most of the time, with a coffee, a stretch and a little dance in between.
 */
const RESTING_DAY: RestingClawd[] = [
  IDLE,
  { src: coffeeSvg, title: "O Clawd tomando um café" },
  IDLE,
  { src: yogaSvg, title: "O Clawd se alongando" },
  IDLE,
  { src: dancingSvg, title: "O Clawd dançando" },
];
const RESTING_ASLEEP: RestingClawd = { src: sleepingSvg, title: "O Clawd dormindo" };

/** Minutes without a key press or a mouse move after which Clawd falls asleep. */
export const AWAY_MINUTES = 5;

/** Which resting Clawd shows at `now`: asleep while you are away from the computer, else the day's loop by the minute. */
export function restingClawd(now: Date, away: boolean): RestingClawd {
  if (away) return RESTING_ASLEEP;
  const minute = Math.floor(now.getTime() / 60_000);
  return RESTING_DAY[minute % RESTING_DAY.length];
}

/** What the most recent running session is doing (sessions come oldest first, as `runningSessions` gives them). */
export const currentWork = (running: Session[]): WorkKind => workKind(running.length > 0 ? running[running.length - 1].tool : null);
