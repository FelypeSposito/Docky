/** Quantas notas a ordem escolhida arrastando guarda (as mais antigas, além disso, voltam para a ordem por data). */
const MAX_MANUAL = 400;

/**
 * Dentro de um grupo: as notas que a pessoa já ordenou seguem a ordem dela; as que ainda não estão nela (as novas)
 * ficam no começo, na ordem em que vieram (da mais recente para a mais antiga).
 */
function byManualOrder<T extends { file: string }>(list: T[], manual: string[]): T[] {
  const rank = new Map(manual.map((file, i) => [file, i]));
  const known = list.filter((n) => rank.has(n.file)).sort((a, b) => (rank.get(a.file) ?? 0) - (rank.get(b.file) ?? 0));
  return [...list.filter((n) => !rank.has(n.file)), ...known];
}

/** As notas fixadas e as outras, cada grupo na ordem que a pessoa escolheu (ou da mais recente para a mais antiga). */
export function splitNotes<T extends { file: string }>(notes: T[], pinned: string[], manual: string[] = []): { pinned: T[]; rest: T[] } {
  const fixed = new Set(pinned);
  return {
    pinned: byManualOrder(
      notes.filter((n) => fixed.has(n.file)),
      manual,
    ),
    rest: byManualOrder(
      notes.filter((n) => !fixed.has(n.file)),
      manual,
    ),
  };
}

/** As notas fixadas vêm primeiro; dentro de cada grupo, a ordem escolhida arrastando, ou a de antes (da mais recente). */
export function orderNotes<T extends { file: string }>(notes: T[], pinned: string[], manual: string[] = []): T[] {
  const { pinned: fixed, rest } = splitNotes(notes, pinned, manual);
  return [...fixed, ...rest];
}

/** A ordem a guardar depois de arrastar: as fixadas e as outras como estão na tela. */
export const nextNoteOrder = (pinnedFiles: string[], restFiles: string[]): string[] => [...pinnedFiles, ...restFiles].slice(0, MAX_MANUAL);

/** Fixa ou desafixa uma nota na lista de fixadas. */
export function togglePinned(pinned: string[], file: string): string[] {
  return pinned.includes(file) ? pinned.filter((f) => f !== file) : [...pinned, file];
}
