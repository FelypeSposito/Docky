import type { ComponentType } from "react";
import { CalendarIcon, GridIcon, MusicIcon, NoteIcon, PulseIcon, SparkIcon, TimerIcon, TrayIcon } from "../icons";
import { AgendaPage } from "./AgendaPage";
import { ClaudePage } from "./ClaudePage";
import { LauncherPage } from "./LauncherPage";
import { MusicPage } from "./MusicPage";
import { NotesPage } from "./NotesPage";
import { ShelfPage } from "./ShelfPage";
import { SystemPage } from "./SystemPage";
import { TimerPage } from "./TimerPage";

export interface PageDef {
  id: string;
  label: string;
  Icon: ComponentType<{ size?: number }>;
  Component: ComponentType<{ active: boolean }>;
}

/** Páginas do dock, na ordem. Cada fase nova acrescenta as suas aqui. */
export const PAGES: PageDef[] = [
  { id: "music", label: "Música", Icon: MusicIcon, Component: MusicPage },
  { id: "timer", label: "Foco", Icon: TimerIcon, Component: TimerPage },
  { id: "note", label: "Notas", Icon: NoteIcon, Component: NotesPage },
  { id: "tray", label: "Shelf", Icon: TrayIcon, Component: ShelfPage },
  { id: "cal", label: "Agenda", Icon: CalendarIcon, Component: AgendaPage },
  { id: "launch", label: "Atalhos", Icon: GridIcon, Component: LauncherPage },
  { id: "system", label: "Sistema", Icon: PulseIcon, Component: SystemPage },
  { id: "claude", label: "Claude", Icon: SparkIcon, Component: ClaudePage },
];
