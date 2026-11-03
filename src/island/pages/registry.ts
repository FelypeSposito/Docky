import type { ComponentType } from "react";
import { CalendarIcon, GridIcon, MusicIcon, NoteIcon, PulseIcon, SparkIcon, TimerIcon, TrayIcon } from "../icons";
import { AgendaLarge, AgendaPage } from "./AgendaPage";
import { ClaudePage } from "./ClaudePage";
import { LauncherPage } from "./LauncherPage";
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
}

/** Páginas do dock, na ordem. Cada fase nova acrescenta as suas aqui. */
export const PAGES: PageDef[] = [
  { id: "music", label: "Música", Icon: MusicIcon, Component: MusicPage },
  { id: "timer", label: "Foco", Icon: TimerIcon, Component: TimerPage },
  { id: "note", label: "Notas", Icon: NoteIcon, Component: NotesPage, Large: NotesLarge },
  { id: "tray", label: "Shelf", Icon: TrayIcon, Component: ShelfPage },
  { id: "cal", label: "Agenda", Icon: CalendarIcon, Component: AgendaPage, Large: AgendaLarge },
  { id: "launch", label: "Atalhos", Icon: GridIcon, Component: LauncherPage },
  { id: "system", label: "Sistema", Icon: PulseIcon, Component: SystemPage },
  { id: "claude", label: "Claude", Icon: SparkIcon, Component: ClaudePage },
];
