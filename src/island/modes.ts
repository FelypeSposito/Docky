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
  work: { w: 380, h: 36 },
  ask: { w: 456, h: 142 },
  expanded: { w: 500, h: 244 },
};

/** A pílula recolhida com o Foco rodando: o relógio no meio e o tempo do Foco numa etiqueta à direita. */
export const IDLE_TIMER: Size = { w: 274, h: 36 };

/** A ilha aberta na versão maior de uma página (botão de expandir no cabeçalho). Cabe na janela de `island.rs`. */
export const EXPANDED_LARGE: Size = { w: 640, h: 400 };

/** Altura do corpo da ilha aberta: as páginas têm 148 px, e a versão maior ganha o que a ilha cresceu. */
export const BODY_HEIGHT = 148;
export const bodyHeight = (large: boolean) => (large ? EXPANDED_LARGE.h - (SIZES.expanded.h - BODY_HEIGHT) : BODY_HEIGHT);

/** Altura de repouso (recolhida); a ilha nunca fica menor que isso. */
export const COLLAPSED_HEIGHT = SIZES.idle.h;

/**
 * Prioridade: um pedido de permissão aparece sempre (você precisa ver); depois a ilha aberta por você,
 * depois os avisos curtos, depois o Claude trabalhando, e por fim a letra ou o relógio.
 * Com letra ativa, o Claude trabalhando não toma o lugar dela: a letra continua e a ilha mostra só um
 * pequeno selo animado no canto (veja `claudeBadge`).
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
  if (state.claude === "work" && !state.lyricActive) return "work";
  return state.lyricActive ? "lyric" : "idle";
}

/** O selo do Claude trabalhando no canto da pílula de letra (só quando a letra aparece no lugar da faixa de trabalho). */
export const claudeBadge = (mode: Mode, claude: ClaudeActivity): boolean => mode === "lyric" && claude === "work";
