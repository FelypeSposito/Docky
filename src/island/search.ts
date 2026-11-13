/** A busca geral do Docky: acha atalhos, páginas, notas e ações a partir do que foi digitado no cabeçalho. */

export type ResultKind = "action" | "shortcut" | "page" | "note";

export interface Candidate {
  id: string;
  kind: ResultKind;
  title: string;
  /** Palavras que também acham o item, além do título ("pomodoro" acha o Foco). */
  keywords?: string;
}

/** Sem acento e em minúsculas: "Música" e "musica" são a mesma busca. */
export const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/** Quanto um item combina com a busca: o começo do título vale mais que o começo de uma palavra, que vale mais que o meio. */
export function score(candidate: Candidate, query: string): number {
  const q = fold(query);
  if (!q) return 0;
  const title = fold(candidate.title);
  if (title.startsWith(q)) return 100;
  if (title.split(/[\s·:,.\-/]+/).some((word) => word.startsWith(q))) return 70;
  if (title.includes(q)) return 50;
  const keywords = fold(candidate.keywords ?? "");
  if (keywords.split(/\s+/).some((word) => word.startsWith(q))) return 40;
  return 0;
}

/** Ordem entre tipos quando a combinação empata: abrir algo vem antes de ir a uma página ou nota. */
const KIND_ORDER: Record<ResultKind, number> = { shortcut: 0, action: 1, page: 2, note: 3 };

/** Os melhores resultados, no máximo `limit`, sem perder a ordem original entre iguais. */
export function rank<T extends Candidate>(candidates: T[], query: string, limit = 6): T[] {
  return candidates
    .map((candidate, order) => ({ candidate, order, score: score(candidate, query) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || KIND_ORDER[a.candidate.kind] - KIND_ORDER[b.candidate.kind] || a.order - b.order)
    .slice(0, limit)
    .map((entry) => entry.candidate);
}

/** O título de uma nota: a primeira linha com texto, sem marcação de título do Markdown. */
export function noteTitle(text: string): string {
  const line = text.split("\n").find((l) => l.trim() !== "") ?? "";
  return line.replace(/^#+\s*/, "").trim() || "Nota sem texto";
}
