/** Espelha `Config` em `src-tauri/src/config.rs` (camelCase). */
export interface ShelfFolder {
  name: string;
  path: string;
}

export interface Shortcut {
  name: string;
  target: string;
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
};
