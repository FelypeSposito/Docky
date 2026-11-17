/** The colors a note can take: a few saturated hues that read on the island's black and tint a card without shouting. */
export const NOTE_COLORS = [
  { id: "yellow", label: "Amarelo", hex: "#f5c84c" },
  { id: "pink", label: "Rosa", hex: "#ff5c7a" },
  { id: "purple", label: "Roxo", hex: "#a78bfa" },
  { id: "blue", label: "Azul", hex: "#4c8dff" },
  { id: "green", label: "Verde", hex: "#34d399" },
] as const;

export type NoteColorId = (typeof NOTE_COLORS)[number]["id"];

/** The color of a note (by file name), or null when it has none or an unknown one. */
export function noteColor(colors: Record<string, string>, file: string): (typeof NOTE_COLORS)[number] | null {
  return NOTE_COLORS.find((c) => c.id === colors[file]) ?? null;
}

/** A new map with `file` painted `color`, or without it when `color` is null. */
export function paintNote(colors: Record<string, string>, file: string, color: string | null): Record<string, string> {
  const next = { ...colors };
  if (color) next[file] = color;
  else delete next[file];
  return next;
}
