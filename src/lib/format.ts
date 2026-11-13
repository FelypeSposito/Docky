const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const pad = (value: number) => String(value).padStart(2, "0");

/** "22:01" */
export function formatClock(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** "sex 30 out 2026" */
export function formatDate(date: Date, withYear = true): string {
  const day = `${WEEKDAYS[date.getDay()]} ${pad(date.getDate())} ${MONTHS[date.getMonth()]}`;
  return withYear ? `${day} ${date.getFullYear()}` : day;
}

/** "hoje · 16:30", "ontem · 09:05" ou "28 out · 18:10": quando uma nota foi alterada, em poucas palavras. */
export function formatNoteDate(ms: number, now: Date = new Date()): string {
  const date = new Date(ms);
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const daysAgo = Math.round((day(now) - day(date)) / 86_400_000);
  const when = daysAgo === 0 ? "hoje" : daysAgo === 1 ? "ontem" : `${String(date.getDate()).padStart(2, "0")} ${MONTHS[date.getMonth()]}`;
  return `${when} · ${formatClock(date)}`;
}
