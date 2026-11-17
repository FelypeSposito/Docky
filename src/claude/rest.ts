/** What Clawd does while Claude Code sessions are open but nothing runs, by the hour. */
export type Rest = "idle" | "sleep" | "coffee" | "gaming";

/**
 * Late night he sleeps (23h to 5h), in the morning he has coffee (5h to 11h), in the evening he plays (19h to 23h),
 * and the rest of the day he just hangs around.
 */
export function restAt(hour: number): Rest {
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  if (h >= 23 || h < 5) return "sleep";
  if (h < 11) return "coffee";
  if (h >= 19) return "gaming";
  return "idle";
}
