/** Espelha `Config` em `src-tauri/src/config.rs` (camelCase). */
export interface ShelfFolder {
  name: string;
  path: string;
  /** Emoji, `lib:nome` (biblioteca do Docky) ou o caminho de uma imagem. Vazio = pasta padrão. */
  icon?: string;
}

export interface Shortcut {
  name: string;
  target: string;
  /** Emoji ou texto curto, ou o caminho de uma imagem. Vazio = a inicial do nome. */
  icon: string;
  /** Identifica o atalho; os grupos apontam para os membros por aqui (o Rust dá um quando falta). */
  id: string;
  /** É um grupo: abre todos os atalhos de `members` de uma vez. */
  group: boolean;
  members: string[];
  /** Fica fora da lista de atalhos, mas continua valendo como item de um grupo. */
  hidden?: boolean;
}

export interface Config {
  startWithWindows: boolean;
  hoverOpen: boolean;
  hideInFullscreen: boolean;
  eyes: boolean;
  followCursor: boolean;
  glow: number;
  reduceMotion: boolean;
  lyricPill: boolean;
  lyricDelayMs: number;
  claudeApprove: boolean;
  notesFolder: string;
  shelfFolders: ShelfFolder[];
  weatherCity: string;
  googleClientId: string;
  focusMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  focusPerSet: number;
  noticeCharge: boolean;
  noticeVolume: boolean;
  noticeClaudeDone: boolean;
  noticeTimer: boolean;
  claudeWorkStrip: boolean;
  hiddenPages: string[];
  systemRefreshMs: number;
  weatherUnit: "c" | "f";
  shelfMove: boolean;
  shortcuts: Shortcut[];
  pageOrder: string[];
  /** Notas fixadas no topo da lista (nomes de arquivo). */
  pinnedNotes: string[];
  /** Ordem das notas escolhida arrastando (nomes de arquivo). As notas novas, que não estão aqui, ficam no topo. */
  noteOrder: string[];
  /** Ordem dos medidores da página Sistema (ids). Vazio = ordem original. */
  systemOrder: string[];
  /** Duração do contador personalizado do Foco, em minutos. */
  timerCustomMinutes: number;
  /** Em quais telas a ilha aparece (nomes dos monitores). Vazio = só na principal. */
  screens: string[];
  /** Pede confirmação antes de abrir apps, jogos e grupos pelos atalhos. */
  confirmApps: boolean;
}

export const DEFAULT_CONFIG: Config = {
  startWithWindows: false,
  hoverOpen: true,
  hideInFullscreen: true,
  eyes: true,
  followCursor: true,
  glow: 70,
  reduceMotion: false,
  lyricPill: true,
  lyricDelayMs: 0,
  claudeApprove: true,
  notesFolder: "",
  shelfFolders: [],
  weatherCity: "",
  googleClientId: "",
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  focusPerSet: 4,
  noticeCharge: true,
  noticeVolume: true,
  noticeClaudeDone: true,
  noticeTimer: true,
  claudeWorkStrip: true,
  hiddenPages: [],
  systemRefreshMs: 1500,
  weatherUnit: "c",
  shelfMove: false,
  shortcuts: [],
  pageOrder: [],
  pinnedNotes: [],
  noteOrder: [],
  systemOrder: [],
  timerCustomMinutes: 10,
  screens: [],
  confirmApps: true,
};
