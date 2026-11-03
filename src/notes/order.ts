/** As notas fixadas vêm primeiro; dentro de cada grupo, a ordem de antes (da mais recente para a mais antiga). */
export function orderNotes<T extends { file: string }>(notes: T[], pinned: string[]): T[] {
  const fixed = new Set(pinned);
  return [...notes.filter((n) => fixed.has(n.file)), ...notes.filter((n) => !fixed.has(n.file))];
}

/** Fixa ou desafixa uma nota na lista de fixadas. */
export function togglePinned(pinned: string[], file: string): string[] {
  return pinned.includes(file) ? pinned.filter((f) => f !== file) : [...pinned, file];
}
