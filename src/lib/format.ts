import { t } from "../i18n";
const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const pad = (value: number) => String(value).padStart(2, "0");

/** "22:01", or "10:01" on a 12-hour clock (no AM/PM: the pill is small and the day is obvious). */
export function formatClock(date: Date, twelveHour = false): string {
  if (!twelveHour) return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return `${date.getHours() % 12 || 12}:${pad(date.getMinutes())}`;
}

/** "sex 30 out 2026" */
export function formatDate(date: Date, withYear = true): string {
  const day = `${t(WEEKDAYS[date.getDay()])} ${pad(date.getDate())} ${t(MONTHS[date.getMonth()])}`;
  return withYear ? `${day} ${date.getFullYear()}` : day;
}

/** "agora", "há 5 min", "há 2 h" or, from yesterday on, the date: how long ago something was copied. */
export function formatAgo(ms: number, now: Date = new Date()): string {
  const minutes = Math.floor((now.getTime() - ms) / 60_000);
  if (minutes < 1) return t("agora");
  if (minutes < 60) return t("há {n} min", { n: minutes });
  if (minutes < 24 * 60) return t("há {n} h", { n: Math.floor(minutes / 60) });
  return formatNoteDate(ms, now);
}

/** "hoje · 16:30", "ontem · 09:05" ou "28 out · 18:10": quando uma nota foi alterada, em poucas palavras. */
export function formatNoteDate(ms: number, now: Date = new Date()): string {
  const date = new Date(ms);
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const daysAgo = Math.round((day(now) - day(date)) / 86_400_000);
  const when = daysAgo === 0 ? t("hoje") : daysAgo === 1 ? t("ontem") : `${String(date.getDate()).padStart(2, "0")} ${t(MONTHS[date.getMonth()])}`;
  return `${when} · ${formatClock(date)}`;
}
