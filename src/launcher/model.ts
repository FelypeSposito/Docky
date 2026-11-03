import type { Shortcut } from "../config/types";

/** Um id curto para um atalho novo (o Rust confere e troca se repetir). */
export const newId = (): string => `n${Math.random().toString(36).slice(2, 8)}`;

/** O destino como o Rust o abre: sem espaços nas pontas e sem as aspas que o "Copiar como caminho" do Explorer traz. */
export const cleanTarget = (target: string): string => target.trim().replace(/^"+|"+$/g, "").trim();

export type TargetKind = "app" | "site" | "other";

const APP_EXTENSION = /\.(exe|lnk|bat|cmd|msi|com|ps1|scr|appref-ms)$/i;

/**
 * O que o destino abre. Programas, jogos (`steam://…`) e apps da Loja (`shell:…`) são "app" e pedem confirmação;
 * `http(s)` é "site"; pastas e documentos são "other".
 */
export function targetKind(target: string): TargetKind {
  const value = cleanTarget(target);
  if (/^https?:\/\//i.test(value)) return "site";
  if (/^[a-z][a-z0-9+.-]+:\/\//i.test(value) || /^shell:/i.test(value) || APP_EXTENSION.test(value)) return "app";
  return "other";
}

/** Os atalhos comuns que o grupo abre, na ordem escolhida. */
export function membersOf(group: Shortcut, shortcuts: Shortcut[]): Shortcut[] {
  return group.members.flatMap((id) => shortcuts.filter((s) => s.id === id && !s.group));
}

/** Abrir este atalho pede confirmação? Programas, jogos e grupos pedem (se a opção estiver ligada). */
export function needsConfirmation(shortcut: Shortcut, shortcuts: Shortcut[], confirmApps: boolean): boolean {
  if (!confirmApps) return false;
  if (shortcut.group) return true;
  return targetKind(shortcut.target) === "app" && membersOf(shortcut, shortcuts).length === 0;
}

/** A pergunta da confirmação: "Abrir Bambuzal?" ou "Abrir Trabalho (Chrome, Claude, Spotify)?". */
export function confirmationText(shortcut: Shortcut, shortcuts: Shortcut[]): string {
  const name = shortcut.name.trim() || "este atalho";
  if (!shortcut.group) return `Abrir ${name}?`;
  const names = membersOf(shortcut, shortcuts).map((s) => s.name.trim() || "sem nome");
  return names.length === 0 ? `${name} está vazio` : `Abrir ${name} (${names.join(", ")})?`;
}

/** Os itens de um grupo numa linha só: "Chrome, Claude, Spotify" ou "Chrome, Claude +2". */
export function memberSummary(group: Shortcut, shortcuts: Shortcut[], show = 2): string {
  const names = membersOf(group, shortcuts).map((s) => s.name.trim() || "sem nome");
  if (names.length === 0) return "Sem itens";
  const rest = names.length - show;
  return rest > 0 ? `${names.slice(0, show).join(", ")} +${rest}` : names.join(", ");
}

/** Atalhos prontos para aparecer: têm nome e (destino ou, se for grupo, ao menos um membro). */
export function isUsable(shortcut: Shortcut, shortcuts: Shortcut[]): boolean {
  if (!shortcut.name.trim()) return false;
  return shortcut.group ? membersOf(shortcut, shortcuts).length > 0 : cleanTarget(shortcut.target) !== "";
}

/** Liga ou desliga um membro de um grupo, mantendo a ordem em que foram marcados. */
export function toggleMember(group: Shortcut, id: string): Shortcut {
  const members = group.members.includes(id) ? group.members.filter((m) => m !== id) : [...group.members, id];
  return { ...group, members };
}

/** Tira um atalho da lista e dos grupos que o tinham como membro. */
export function removeShortcut(shortcuts: Shortcut[], index: number): Shortcut[] {
  const gone = shortcuts[index]?.id;
  return shortcuts.filter((_, i) => i !== index).map((s) => (s.group ? { ...s, members: s.members.filter((m) => m !== gone) } : s));
}

export interface Indexed {
  item: Shortcut;
  /** A posição na lista de atalhos (é por ela que o Rust acha o item a abrir). */
  index: number;
}

/** Os grupos e os atalhos comuns em duas partes separadas, cada uma na ordem em que estão. */
export function splitShortcuts(shortcuts: Shortcut[]): { groups: Indexed[]; items: Indexed[] } {
  const all = shortcuts.map((item, index) => ({ item, index }));
  return { groups: all.filter((e) => e.item.group), items: all.filter((e) => !e.item.group) };
}

/**
 * Nova ordem de uma das partes (`group` = os grupos; senão, os atalhos). A lista fica sempre com os grupos primeiro,
 * então cada parte se reordena sozinha, sem misturar.
 */
export function reorderSection(shortcuts: Shortcut[], group: boolean, order: string[]): Shortcut[] {
  const { groups, items } = splitShortcuts(shortcuts);
  const section = (list: Indexed[]) => list.map((e) => e.item);
  const sorted = (list: Indexed[]) => order.flatMap((id) => list.filter((e) => e.item.id === id).map((e) => e.item));
  return group ? [...sorted(groups), ...section(items)] : [...section(groups), ...sorted(items)];
}

/** Os ids dos atalhos que fazem parte de algum grupo. */
export const groupedIds = (shortcuts: Shortcut[]): Set<string> => new Set(shortcuts.filter((s) => s.group).flatMap((s) => s.members));

/** Quantos atalhos comuns, de grupo e ainda visíveis, dá para ocultar (eles continuam funcionando nos grupos). */
export const hideableCount = (shortcuts: Shortcut[]): number => {
  const inGroups = groupedIds(shortcuts);
  return shortcuts.filter((s) => !s.group && !s.hidden && inGroups.has(s.id)).length;
};

/** Oculta os atalhos comuns que já estão em algum grupo. */
export function hideGrouped(shortcuts: Shortcut[]): Shortcut[] {
  const inGroups = groupedIds(shortcuts);
  return shortcuts.map((s) => (!s.group && inGroups.has(s.id) && !s.hidden ? { ...s, hidden: true } : s));
}

/** Mostra ou oculta um atalho da lista. */
export const setHidden = (shortcuts: Shortcut[], id: string, hidden: boolean): Shortcut[] =>
  shortcuts.map((s) => (s.id === id ? (hidden ? { ...s, hidden: true } : { ...s, hidden: false }) : s));
