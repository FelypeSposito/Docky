import { EN } from "./en";

/**
 * Docky's interface is written in Portuguese (Brazil), and the Portuguese text is the key: `t("Abrir no GitHub")`.
 * In English the phrase is looked up in `en.ts`; a phrase missing there stays in Portuguese, so nothing ever shows
 * a raw key. `{name}` placeholders are filled from `vars`: `t("há {n} min", { n: 5 })`.
 */
export type Language = "pt" | "en";

/** The setting: follow Windows ("auto"), or pick one. */
export type LanguageSetting = "auto" | Language;

let current: Language = "pt";

/** "auto" follows the system: Portuguese on a Portuguese system, English everywhere else. */
export function resolveLanguage(setting: string | undefined, system: string | undefined): Language {
  if (setting === "pt" || setting === "en") return setting;
  return (system ?? "").toLowerCase().startsWith("pt") ? "pt" : "en";
}

export function setLanguage(language: Language): void {
  current = language;
  document.documentElement.lang = language === "pt" ? "pt-BR" : "en";
}

export function language(): Language {
  return current;
}

const fill = (text: string, vars?: Record<string, string | number>) =>
  vars ? text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole)) : text;

/** The phrase in the current language. */
export function t(pt: string, vars?: Record<string, string | number>): string {
  return fill(current === "en" ? (EN[pt] ?? pt) : pt, vars);
}

/** Singular or plural, by `n`: `plural(3, "1 item", "{n} itens")`. Both forms go through `t`. */
export function plural(n: number, one: string, many: string): string {
  return n === 1 ? t(one, { n }) : t(many, { n });
}
