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
  /** Reserva uma faixa no topo das telas da ilha: as janelas maximizadas começam abaixo da pílula. */
  reserveSpace: boolean;
  eyes: boolean;
  followCursor: boolean;
  glow: number;
  /** The island's color (see island/theme.ts); empty = taken from the album cover of what is playing. */
  islandColor: string;
  /** The thin light along the island's edge. */
  glassEdge: boolean;
  /** The island's material: "solid" (black) or "glass" (liquid glass). */
  material: string;
  /** With the glass material: "clear" (more see-through) or "tinted" (more opaque, more contrast), like Apple's. */
  glassStyle: string;
  /** The clock on the pill and in the header on a 12-hour dial. */
  clock12h: boolean;
  /** Keeps the last texts you copied (in memory only) for the Copiados page. */
  clipboardHistory: boolean;
  /** The welcome card was seen (or closed); off only on a brand-new install. */
  onboarded: boolean;
  /** Asks GitHub, twice a day, whether a newer Docky was released. */
  checkUpdates: boolean;
  /** Interface language: "auto" (follow the system), "pt" or "en". */
  language: string;
  reduceMotion: boolean;
  lyricPill: boolean;
  lyricDelayMs: number;
  claudeApprove: boolean;
  notesFolder: string;
  shelfFolders: ShelfFolder[];
  weatherCity: string;
  googleClientId: string;
  /** Client ID of the person's own Discord app; the secret stays in the Credential Manager. */
  discordClientId: string;
  focusMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  focusPerSet: number;
  noticeCharge: boolean;
  noticeVolume: boolean;
  noticeClaudeDone: boolean;
  noticeTimer: boolean;
  /** Short notice when a long fullscreen session (a game) ends. */
  noticeGame: boolean;
  /** Short notice when a download finishes. */
  noticeDownload: boolean;
  /** Short notice with the charge of Bluetooth headphones when they connect, and when it runs low. */
  noticeBluetooth: boolean;
  /** Call timer and mic mute on the pill while an app uses the microphone. */
  callPill: boolean;
  /** Um som suave quando o Foco ou o contador termina. */
  timerSound: boolean;
  /** Data e hora no cabeçalho da ilha aberta. */
  headerClock: boolean;
  /** Where the island sits along the top edge: 0 = flush left, 0.5 = centered, 1 = flush right. */
  islandPosition: number;
  claudeWorkStrip: boolean;
  hiddenPages: string[];
  weatherUnit: "c" | "f";
  shelfMove: boolean;
  /** Shelf: the Recycle Bin tile next to the folders. */
  shelfTrash: boolean;
  shortcuts: Shortcut[];
  pageOrder: string[];
  /** Notas fixadas no topo da lista (nomes de arquivo). */
  pinnedNotes: string[];
  /** Color of each note (file name to color id, see notes/colors.ts); notes without one stay plain. */
  noteColors: Record<string, string>;
  /** Ordem das notas escolhida arrastando (nomes de arquivo). As notas novas, que não estão aqui, ficam no topo. */
  noteOrder: string[];
  /** Ordem dos medidores da página Sistema (ids). Vazio = ordem original. */
  /** Duração do contador personalizado do Foco, em minutos. */
  timerCustomMinutes: number;
  /** Em quais telas a ilha aparece (nomes dos monitores). Vazio = só na principal. */
  screens: string[];
  /** Pede confirmação antes de abrir apps, jogos e grupos pelos atalhos. */
  confirmApps: boolean;
  /** Um app que já está aberto vem para a frente, em vez de abrir outra janela dele. */
  focusOpenApps: boolean;
  /** Pasta dos ícones (imagens) dos atalhos; os ícones automáticos ficam nela. Vazio = Documentos\Docky\icons. */
  iconsFolder: string;
  /** Busca na internet, uma vez, o ícone de cada atalho novo que ficou sem ícone. */
  autoIcons: boolean;
  /** A pessoa deixou o Docky procurar os apps e jogos instalados para sugerir atalhos (desligado até ela permitir). */
  scanApps: boolean;
  /** Seções da tela de atalhos (Jogos, Comunicação…), na ordem em que aparecem. */
  shortcutSections: ShortcutSection[];
}

/** Uma seção da tela de atalhos: um nome, se está recolhida e os atalhos que estão nela (ids, sem grupos). */
export interface ShortcutSection {
  id: string;
  name: string;
  collapsed: boolean;
  members: string[];
  /** Part of the day when this section goes first in the island ("morning", "afternoon", "night"); empty = always. */
  hours?: string;
}

export const DEFAULT_CONFIG: Config = {
  startWithWindows: false,
  hoverOpen: true,
  hideInFullscreen: true,
  reserveSpace: false,
  eyes: true,
  followCursor: true,
  glow: 70,
  islandColor: "",
  glassEdge: true,
  material: "solid",
  glassStyle: "clear",
  clock12h: false,
  clipboardHistory: true,
  onboarded: false,
  checkUpdates: true,
  language: "auto",
  reduceMotion: false,
  lyricPill: true,
  lyricDelayMs: 0,
  claudeApprove: true,
  notesFolder: "",
  shelfFolders: [],
  weatherCity: "",
  googleClientId: "",
  discordClientId: "",
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  focusPerSet: 4,
  noticeCharge: true,
  noticeVolume: true,
  noticeClaudeDone: true,
  noticeTimer: true,
  noticeGame: true,
  noticeDownload: true,
  noticeBluetooth: true,
  callPill: true,
  timerSound: true,
  headerClock: true,
  islandPosition: 0.5,
  claudeWorkStrip: true,
  hiddenPages: ["cal"],
  weatherUnit: "c",
  shelfMove: false,
  shelfTrash: true,
  shortcuts: [],
  pageOrder: [],
  pinnedNotes: [],
  noteColors: {},
  noteOrder: [],
  timerCustomMinutes: 10,
  screens: [],
  confirmApps: true,
  focusOpenApps: true,
  iconsFolder: "",
  autoIcons: true,
  scanApps: false,
  shortcutSections: [],
};
