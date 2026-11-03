import type { ComponentType } from "react";
import { CalendarIcon, GridIcon, MusicIcon, NoteIcon, PulseIcon, SparkIcon, TimerIcon, TrayIcon } from "../icons";
import { AgendaLarge, AgendaPage } from "./AgendaPage";
import { ClaudePage } from "./ClaudePage";
import { AgendaQuick, ClaudeQuick, LauncherQuick, MusicQuick, NotesQuick, ShelfQuick, SystemQuick, TimerQuick } from "../quick/pages";
import { LauncherLarge, LauncherPage } from "./LauncherPage";
import { MusicPage } from "./MusicPage";
import { NotesLarge, NotesPage } from "./NotesPage";
import { ShelfPage } from "./ShelfPage";
import { SystemPage } from "./SystemPage";
import { TimerPage } from "./TimerPage";

export interface PageDef {
  id: string;
  label: string;
  Icon: ComponentType<{ size?: number }>;
  Component: ComponentType<{ active: boolean }>;
  /** A versão maior da página, mostrada pelo botão de expandir. Sem ela, o botão não aparece. */
  Large?: ComponentType<{ active: boolean }>;
  /** Os ajustes da página, sem abrir a janela de configurações. Aparecem na tela expandida, pelo botão de ajustes. */
  Settings?: ComponentType;
}

/** Páginas do dock, na ordem. Cada fase nova acrescenta as suas aqui. */
export const PAGES: PageDef[] = [
  { id: "music", label: "Música", Icon: MusicIcon, Component: MusicPage, Settings: MusicQuick },
  { id: "timer", label: "Foco", Icon: TimerIcon, Component: TimerPage, Settings: TimerQuick },
  { id: "note", label: "Notas", Icon: NoteIcon, Component: NotesPage, Large: NotesLarge, Settings: NotesQuick },
  { id: "tray", label: "Shelf", Icon: TrayIcon, Component: ShelfPage, Settings: ShelfQuick },
  { id: "cal", label: "Agenda", Icon: CalendarIcon, Component: AgendaPage, Large: AgendaLarge, Settings: AgendaQuick },
  { id: "launch", label: "Atalhos", Icon: GridIcon, Component: LauncherPage, Large: LauncherLarge, Settings: LauncherQuick },
  { id: "system", label: "Sistema", Icon: PulseIcon, Component: SystemPage, Settings: SystemQuick },
  { id: "claude", label: "Claude", Icon: SparkIcon, Component: ClaudePage, Settings: ClaudeQuick },
];
