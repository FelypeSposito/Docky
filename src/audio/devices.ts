import { t } from "../i18n";
import type { AudioOutput } from "../lib/ipc";

/**
 * Splits Windows' endpoint name into what it is and which device it belongs to:
 * "Fones de ouvido (UGREEN Studio Pro)" → { title: "Fones de ouvido", detail: "UGREEN Studio Pro" }.
 * Only the last parenthesis is the device, so "Alto-falantes (Realtek(R) Audio)" keeps its inner "(R)".
 */
export function splitOutputName(name: string): { title: string; detail: string } {
  const trimmed = name.trim();
  if (!trimmed.endsWith(")")) return { title: trimmed, detail: "" };
  let depth = 0;
  for (let i = trimmed.length - 1; i >= 0; i--) {
    if (trimmed[i] === ")") depth++;
    else if (trimmed[i] === "(" && --depth === 0) {
      const title = trimmed.slice(0, i).trim();
      const detail = trimmed.slice(i + 1, -1).trim();
      // A monitor shows up as "5 - H238F165 (AMD High Definition Audio Device)": the title is the useful part.
      return title ? { title: title.replace(/^\d+\s*-\s*/, ""), detail } : { title: detail, detail: "" };
    }
  }
  return { title: trimmed, detail: "" };
}

/**
 * Who an output belongs to, for a sentence: the device in the parenthesis when there is one.
 * "Alto-falantes (FxSound Audio Enhancer)" → "FxSound Audio Enhancer".
 */
export function appName(outputName: string): string {
  const { title, detail } = splitOutputName(outputName);
  return detail || title;
}

/** The default output first, then the rest by the name shown (so a monitor's "5 - " does not jump the queue). */
export function sortOutputs(outputs: AudioOutput[]): AudioOutput[] {
  const shown = (o: AudioOutput) => splitOutputName(o.name).title;
  return [...outputs].sort((a, b) => Number(b.default) - Number(a.default) || shown(a).localeCompare(shown(b), "pt-BR"));
}

/** Short words for the pill notice and the button. */
export const micText = (muted: boolean) => t(muted ? "Microfone mudo" : "Microfone ligado");
