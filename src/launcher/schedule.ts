import type { Shortcut, ShortcutSection } from "../config/types";

/** Part of the day a section can be scheduled for: it goes first in the island during that time. */
export type DayPart = "morning" | "afternoon" | "night";

export const DAY_PARTS: { value: DayPart; label: string; hours: string }[] = [
  { value: "morning", label: "De manhã", hours: "5h às 12h" },
  { value: "afternoon", label: "À tarde", hours: "12h às 18h" },
  { value: "night", label: "À noite", hours: "18h às 5h" },
];

export function dayPart(date: Date): DayPart {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "afternoon";
  return "night";
}

/** The section that goes first now: the highest-priority one scheduled for this part of the day that has shortcuts. */
export const scheduledSection = (sections: ShortcutSection[], date: Date): ShortcutSection | undefined =>
  sections.find((section) => section.hours === dayPart(date) && section.members.length > 0);

/** Puts the section's shortcuts first; both parts keep their own order. */
export function scheduleFirst<T extends { item: Shortcut }>(list: T[], section: ShortcutSection | undefined): T[] {
  if (!section) return list;
  const inside = new Set(section.members);
  return [...list.filter((e) => inside.has(e.item.id)), ...list.filter((e) => !inside.has(e.item.id))];
}
