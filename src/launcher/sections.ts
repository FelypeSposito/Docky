import type { Shortcut, ShortcutSection } from "../config/types";
import { cleanTarget } from "./model";

/** Um atalho com a posição dele na lista completa (a mesma ideia de `splitShortcuts`). */
export interface IndexedShortcut {
  item: Shortcut;
  index: number;
}

/** Uma parte da tela de atalhos: uma seção da pessoa, ou "os que não estão em seção nenhuma" (`section` = null). */
export interface SectionBlock {
  section: ShortcutSection | null;
  entries: IndexedShortcut[];
}

/** A seção de um atalho (a primeira que o lista), ou `undefined`. */
export const sectionOf = (id: string, sections: ShortcutSection[]): ShortcutSection | undefined => sections.find((s) => s.members.includes(id));

/**
 * Os atalhos divididos em seções, na ordem das seções; dentro de cada uma, a ordem da lista. Os que não estão em
 * seção nenhuma vêm por último (`section` = null). Seções vazias aparecem (para dar para ver e arrastar para elas)
 * só quando `keepEmpty` for verdadeiro.
 */
export function layoutSections(entries: IndexedShortcut[], sections: ShortcutSection[], keepEmpty = false): SectionBlock[] {
  const placed = new Set<string>();
  const blocks: SectionBlock[] = sections.map((section) => {
    const inside = entries.filter((e) => section.members.includes(e.item.id) && !placed.has(e.item.id));
    inside.forEach((e) => placed.add(e.item.id));
    return { section, entries: inside };
  });
  const rest = entries.filter((e) => !placed.has(e.item.id));
  return [...blocks.filter((b) => keepEmpty || b.entries.length > 0), ...(rest.length > 0 ? [{ section: null, entries: rest }] : [])];
}

/** Põe o atalho numa seção (ou em nenhuma, com `sectionId` = null), tirando-o de onde estava. */
export function assignSection(sections: ShortcutSection[], shortcutId: string, sectionId: string | null): ShortcutSection[] {
  return sections.map((s) => {
    const members = s.members.filter((m) => m !== shortcutId);
    return s.id === sectionId ? { ...s, members: [...members, shortcutId] } : members.length === s.members.length ? s : { ...s, members };
  });
}

export const addSection = (sections: ShortcutSection[], name: string, makeId: () => string): ShortcutSection[] => [...sections, { id: makeId(), name: name.trim() || "Nova seção", collapsed: false, members: [] }];

export const renameSection = (sections: ShortcutSection[], id: string, name: string): ShortcutSection[] => sections.map((s) => (s.id === id ? { ...s, name: name.trim() || s.name } : s));

/** Apaga a seção; os atalhos dela continuam, só ficam sem seção. */
export const removeSection = (sections: ShortcutSection[], id: string): ShortcutSection[] => sections.filter((s) => s.id !== id);

export const toggleCollapsed = (sections: ShortcutSection[], id: string): ShortcutSection[] => sections.map((s) => (s.id === id ? { ...s, collapsed: !s.collapsed } : s));

/** Tira das seções os ids que não são mais atalhos (apagados, ou que viraram grupo). */
export function pruneSections(sections: ShortcutSection[], shortcuts: Shortcut[]): ShortcutSection[] {
  const valid = new Set(shortcuts.filter((s) => !s.group).map((s) => s.id));
  return sections.map((s) => (s.members.every((m) => valid.has(m)) ? s : { ...s, members: s.members.filter((m) => valid.has(m)) }));
}

interface Preset {
  name: string;
  /** Casa com o nome ou o destino do atalho. */
  match: RegExp;
}

/**
 * As seções prontas do "Organizar", na ordem em que aparecem. A primeira que casar com o atalho ganha: por isso os
 * jogos vêm antes (um jogo da Steam não deve cair em "Utilitários" por causa de uma palavra no nome).
 */
export const PRESET_SECTIONS: Preset[] = [
  { name: "Jogos", match: /steam:\/\/|com\.epicgames|epic games|\bsteam\b|battle\.?net|riot|valorant|league of legends|minecraft|roblox|xbox|ea app|ubisoft|\bgog\b|counter-strike|fortnite|rocket league|hydra|\bjogos?\b|\bgames?\b/i },
  { name: "Comunicação", match: /whatsapp|discord|telegram|slack|teams|zoom|skype|signal|messenger|gmail|outlook|\bmail\b|e-?mail|thunderbird/i },
  { name: "Música e vídeo", match: /spotify|deezer|apple music|youtube|netflix|prime video|disney|twitch|vlc|\bplex\b|fxsound|tidal/i },
  { name: "Criação", match: /figma|photoshop|illustrator|lightroom|premiere|after effects|davinci|blender|canva|krita|gimp|inkscape|\bobs\b|capcut|audacity/i },
  { name: "Desenvolvimento", match: /visual studio|vs ?code|\bcode\.exe|cursor|jetbrains|intellij|pycharm|webstorm|android studio|github|gitlab|bitbucket|\bgit\b|docker|postman|terminal|powershell|\bcmd\b|antigravity|claude|chatgpt|warp/i },
  { name: "Trabalho", match: /notion|obsidian|onenote|evernote|jira|confluence|trello|asana|clickup|glpi|\bdrive\b|google docs|docs\.google|sheets|word|excel|powerpoint|office|acrobat|\bpdf\b|calendar|agenda/i },
  { name: "Utilitários", match: /explorer|explorador|\bpasta\b|folder|configura|settings|calculadora|calculator|7-?zip|winrar|lossless|kanata|cooler|cpu|hwinfo|afterburner|everything|powertoys|lightshot|sharex|snipping|recorte|bitwarden|1password|nordvpn|cloudflare|chrome|firefox|edge|brave|opera/i },
];

/**
 * Organiza os atalhos sem seção nas seções prontas que fazem sentido (Jogos, Comunicação, Utilitários…), criando só as
 * seções que ganham algum atalho e reaproveitando as que já existem com o mesmo nome. Quem já está numa seção fica
 * onde está; quem não casa com nada continua sem seção.
 */
export function autoOrganize(shortcuts: Shortcut[], sections: ShortcutSection[], makeId: () => string): ShortcutSection[] {
  let next = sections.map((s) => ({ ...s, members: [...s.members] }));
  for (const shortcut of shortcuts) {
    if (shortcut.group || shortcut.hidden || sectionOf(shortcut.id, next)) continue;
    const haystack = `${shortcut.name} ${cleanTarget(shortcut.target)}`;
    const preset = PRESET_SECTIONS.find((p) => p.match.test(haystack));
    if (!preset) continue;
    let section = next.find((s) => s.name.trim().toLowerCase() === preset.name.toLowerCase());
    if (!section) {
      section = { id: makeId(), name: preset.name, collapsed: false, members: [] };
      next = [...next, section];
    }
    section.members.push(shortcut.id);
  }
  // Na ordem das seções prontas; as que a pessoa criou à mão ficam antes, como estavam.
  const presetIndex = (s: ShortcutSection) => PRESET_SECTIONS.findIndex((p) => p.name.toLowerCase() === s.name.trim().toLowerCase());
  const own = next.filter((s) => presetIndex(s) < 0);
  const presets = next.filter((s) => presetIndex(s) >= 0).sort((a, b) => presetIndex(a) - presetIndex(b));
  return [...own, ...presets];
}
