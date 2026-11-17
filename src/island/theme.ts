import { type Accent, DEFAULT_ACCENT } from "../media/accent";

/**
 * The island's own colors, for people who want one look instead of the album cover's. Each has the accent (buttons,
 * bars, the equalizer) and a second hue for the ambient glow. The first one is Docky's brand pink.
 */
export const ISLAND_COLORS = [
  { id: "pink", label: "Rosa", primary: "#ff5c7a", secondary: "#7a3cff" },
  { id: "amber", label: "Âmbar", primary: "#f5b14c", secondary: "#ff6a3d" },
  { id: "green", label: "Verde", primary: "#34d399", secondary: "#1f9fb5" },
  { id: "blue", label: "Azul", primary: "#4c8dff", secondary: "#7a5cff" },
  { id: "lilac", label: "Lilás", primary: "#a78bfa", secondary: "#e26fd0" },
  { id: "graphite", label: "Grafite", primary: "#c3c7cf", secondary: "#5d6470" },
] as const;

/** The color picked in Settings, or null for "from the music" (an empty or unknown id). */
export function islandColor(id: string) {
  return ISLAND_COLORS.find((c) => c.id === id) ?? null;
}

/** The accent the island paints with: the picked color, else the album cover's, else the brand pink. */
export function islandAccent(id: string, fromMusic: Accent | null): Accent {
  const picked = islandColor(id);
  if (picked) return { primary: picked.primary, secondary: picked.secondary };
  return fromMusic ?? DEFAULT_ACCENT;
}

/** Where the slider's default sits, and how strong the glow is there (the look Docky always had). */
const DEFAULT_STEP = 70;
const DEFAULT_OPACITY = 0.434;
const MAX_OPACITY = 0.95;

/**
 * The ambient glow's opacity for the "Brilho ambiente" slider (0 to 100). Up to the default it is the same as it
 * always was; past it, the glow climbs faster, so the top of the slider is clearly brighter.
 */
export function glowOpacity(glow: number): number {
  const step = Number.isFinite(glow) ? Math.min(100, Math.max(0, glow)) : DEFAULT_STEP;
  if (step <= DEFAULT_STEP) return (step / DEFAULT_STEP) * DEFAULT_OPACITY;
  return DEFAULT_OPACITY + ((step - DEFAULT_STEP) / (100 - DEFAULT_STEP)) * (MAX_OPACITY - DEFAULT_OPACITY);
}

/** How far past the default the slider is (0 at or below it, 1 at the top): the glow also reaches higher up the island. */
export function glowReach(glow: number): number {
  const step = Number.isFinite(glow) ? Math.min(100, Math.max(0, glow)) : DEFAULT_STEP;
  return Math.max(0, (step - DEFAULT_STEP) / (100 - DEFAULT_STEP));
}
