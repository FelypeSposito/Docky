/**
 * The colors a note can take, in two rows: bright hues that stand out on the island's black, and quieter ones (greys
 * and dusty tones) for notes that only need to be told apart.
 */
export const NOTE_COLORS = [
  { id: "yellow", label: "Amarelo", hex: "#f5c84c", tone: "vivid" },
  { id: "pink", label: "Rosa", hex: "#ff5c7a", tone: "vivid" },
  { id: "purple", label: "Roxo", hex: "#a78bfa", tone: "vivid" },
  { id: "blue", label: "Azul", hex: "#4c8dff", tone: "vivid" },
  { id: "green", label: "Verde", hex: "#34d399", tone: "vivid" },
  { id: "sand", label: "Areia", hex: "#d6c4a0", tone: "soft" },
  { id: "mauve", label: "Malva", hex: "#b89aaa", tone: "soft" },
  { id: "slate", label: "Ardósia", hex: "#8f9db3", tone: "soft" },
  { id: "sage", label: "Sálvia", hex: "#9fb59c", tone: "soft" },
  { id: "grey", label: "Cinza", hex: "#a3a3ab", tone: "soft" },
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
