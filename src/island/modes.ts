/** Estados visuais da ilha e seus tamanhos (pixels lógicos). Cresce a cada fase. */
export type Overlay = "charge" | "volume" | "done" | "timer";
export type Mode = "idle" | "lyric" | "charge" | "volume" | "done" | "timer" | "work" | "ask" | "expanded";

/** O que o Claude Code está pedindo da ilha agora. */
export type ClaudeActivity = "ask" | "work" | null;

export interface Size {
  w: number;
  h: number;
}

export const SIZES: Record<Mode, Size> = {
  idle: { w: 214, h: 36 },
  lyric: { w: 410, h: 36 },
  charge: { w: 252, h: 36 },
  volume: { w: 270, h: 36 },
  done: { w: 262, h: 36 },
  timer: { w: 262, h: 36 },
  work: { w: 340, h: 36 },
  ask: { w: 456, h: 142 },
  expanded: { w: 500, h: 244 },
};

/** Altura de repouso (recolhida); a ilha nunca fica menor que isso. */
export const COLLAPSED_HEIGHT = SIZES.idle.h;

/**
 * Prioridade: um pedido de permissão aparece sempre (você precisa ver); depois a ilha aberta por você,
 * depois os avisos curtos, depois o Claude trabalhando, e por fim a letra ou o relógio.
 */
export function resolveMode(state: {
  expanded: boolean;
  overlay: Overlay | null;
  lyricActive: boolean;
  claude: ClaudeActivity;
}): Mode {
  if (state.claude === "ask") return "ask";
  if (state.expanded) return "expanded";
  if (state.overlay) return state.overlay;
  if (state.claude === "work") return "work";
  return state.lyricActive ? "lyric" : "idle";
}
