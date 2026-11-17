import buildingSvg from "../assets/clawd/clawd-working-building.svg";
import delegateSvg from "../assets/clawd/clawd-working-juggling.svg";
import readingSvg from "../assets/clawd/clawd-working-reviewing.svg";
import thinkingSvg from "../assets/clawd/clawd-working-thinking.svg";
import toolSvg from "../assets/clawd/clawd-working-tool-calling.svg";
import waitSvg from "../assets/clawd/clawd-notification.svg";
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

/** What the most recent running session is doing (sessions come oldest first, as `runningSessions` gives them). */
export const currentWork = (running: Session[]): WorkKind => workKind(running.length > 0 ? running[running.length - 1].tool : null);
