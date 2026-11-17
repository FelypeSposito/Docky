/**
 * Quick reminders typed in the note field: "15 min tirar a pizza", "em 2h ligar pro banco", "1h30 reunião",
 * "às 18h buscar as crianças", "as 9:30 dentista". Without one of these at the start, the text is a plain note.
 */
export interface ReminderDraft {
  /** Unix ms */
  at: number;
  text: string;
}

const MINUTE = 60_000;
/** Reminders go at most a day ahead: further than that belongs in a calendar. */
const MAX_AHEAD = 24 * 60 * MINUTE;

/** "em 15 min", "15min", "15 minutos" */
const IN_MINUTES = /^(?:em\s+)?(\d{1,4})\s*(?:min|mins|minuto|minutos|m)(?=\s|$)\s*(.*)$/i;
/** "em 2h", "2 horas", "1h30", "1h 30min" */
const IN_HOURS = /^(?:em\s+)?(\d{1,2})\s*(?:h|hr|hrs|hora|horas)(?:\s*(\d{1,2})\s*(?:min|m)?)?(?=\s|$)\s*(.*)$/i;
/** "às 18h", "as 18:30", "às 9h15" */
const AT_TIME = /^(?:às|as|à|a)\s+(\d{1,2})(?:\s*(?:h|:)\s*(\d{2})?)?(?:\s*h)?(?=\s|$)\s*(.*)$/i;

/** The reminder in `input`, or null when it is just a note (or the time makes no sense). */
export function parseReminder(input: string, now: Date = new Date()): ReminderDraft | null {
  const value = input.trim();
  let at: number | null = null;
  let text = "";

  const minutes = value.match(IN_MINUTES);
  const hours = value.match(IN_HOURS);
  const clock = value.match(AT_TIME);
  if (minutes) {
    at = now.getTime() + Number(minutes[1]) * MINUTE;
    text = minutes[2];
  } else if (hours) {
    at = now.getTime() + (Number(hours[1]) * 60 + Number(hours[2] ?? 0)) * MINUTE;
    text = hours[3];
  } else if (clock) {
    const h = Number(clock[1]);
    const m = Number(clock[2] ?? 0);
    if (h > 23 || m > 59) return null;
    const when = new Date(now);
    when.setHours(h, m, 0, 0);
    // A time that already passed today means tomorrow.
    if (when.getTime() <= now.getTime()) when.setDate(when.getDate() + 1);
    at = when.getTime();
    text = clock[3];
  }

  text = text.trim();
  if (at === null || !text || at <= now.getTime() || at - now.getTime() > MAX_AHEAD) return null;
  return { at, text };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "18:45", or "amanhã 09:30" when it is not today. */
export function formatWhen(at: number, now: Date = new Date(), twelveHour = false): string {
  const when = new Date(at);
  const h = twelveHour ? when.getHours() % 12 || 12 : when.getHours();
  const time = `${twelveHour ? h : pad(h)}:${pad(when.getMinutes())}`;
  return when.toDateString() === now.toDateString() ? time : `amanhã ${time}`;
}
