import { formatClock } from "../lib/format";

export interface CalEvent {
  id: string;
  title: string;
  startMs: number;
  endMs: number;
  allDay: boolean;
  location: string | null;
  /** Link da videochamada (Meet, Zoom…), se o evento tiver. */
  meetUrl: string | null;
}

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** Eventos que ainda não acabaram, na ordem de início. */
export function upcoming(events: CalEvent[], now: number): CalEvent[] {
  return events.filter((e) => e.endMs > now).sort((a, b) => a.startMs - b.startMs);
}

/** Quando o evento começa, em poucas palavras: "agora", "em 12 min", "em 2 h", "hoje · 15:30", "amanhã · 09:00". */
export function untilLabel(event: CalEvent, now: number): string {
  if (event.allDay) return "dia todo";
  if (event.startMs <= now) return "agora";

  const diff = event.startMs - now;
  if (diff < HOUR) return `em ${Math.max(1, Math.ceil(diff / MINUTE))} min`;
  if (diff < 6 * HOUR) {
    const hours = Math.floor(diff / HOUR);
    const minutes = Math.round((diff % HOUR) / MINUTE);
    return minutes === 0 || minutes === 60 ? `em ${hours + (minutes === 60 ? 1 : 0)} h` : `em ${hours} h ${minutes} min`;
  }

  const start = new Date(event.startMs);
  const days = Math.round((dayStart(start) - dayStart(new Date(now))) / (24 * HOUR));
  const when = days === 0 ? "hoje" : days === 1 ? "amanhã" : `${String(start.getDate()).padStart(2, "0")} ${MONTHS[start.getMonth()]}`;
  return `${when} · ${formatClock(start)}`;
}

/** Progresso (0 a 1) da espera até o início, usando as 2 horas anteriores; 1 quando já começou. */
export function waitProgress(event: CalEvent, now: number): number {
  if (event.allDay || event.startMs <= now) return 1;
  return Math.min(1, Math.max(0, 1 - (event.startMs - now) / (2 * HOUR)));
}
