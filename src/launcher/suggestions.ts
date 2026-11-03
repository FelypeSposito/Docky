import { useEffect } from "react";
import { create } from "zustand";
import type { Shortcut } from "../config/types";
import { ipc } from "../lib/ipc";
import { cleanTarget } from "./model";

/** Um app instalado (do Menu Iniciar ou da Área de Trabalho), com os sinais de que você o usa. */
export interface AppEntry {
  name: string;
  /** O atalho `.lnk`, que abre o app como o Menu Iniciar abriria. */
  target: string;
  uses: number;
  pinned: boolean;
  running: boolean;
}

export interface TemplateApp {
  label: string;
  match: RegExp;
}

export interface GroupTemplate {
  id: string;
  name: string;
  /** Ícone da biblioteca (`lib:nome`) do grupo criado. */
  icon: string;
  blurb: string;
  apps: TemplateApp[];
}

const app = (label: string, match: RegExp): TemplateApp => ({ label, match });
const CLAUDE = app("Claude", /claude/i);
const CHROME = app("Chrome", /chrome/i);
const SPOTIFY = app("Spotify", /spotify/i);
const OBSIDIAN = app("Obsidian", /obsidian/i);
const DISCORD = app("Discord", /discord/i);

/** Grupos que costumam fazer sentido: cada um junta os apps que você abriria juntos. */
export const TEMPLATES: GroupTemplate[] = [
  { id: "trabalho", name: "Trabalho", icon: "lib:briefcase", blurb: "Para começar o dia de trabalho de uma vez", apps: [CLAUDE, CHROME, SPOTIFY, OBSIDIAN] },
  { id: "jogos", name: "Jogos", icon: "lib:game", blurb: "Música, jogos e a galera", apps: [SPOTIFY, app("Steam", /steam/i), DISCORD] },
  { id: "estudos", name: "Estudos", icon: "lib:book", blurb: "Anotações, pesquisa e foco", apps: [OBSIDIAN, app("Notion", /notion/i), CHROME, SPOTIFY] },
  { id: "conversas", name: "Conversas", icon: "lib:chat", blurb: "Todos os mensageiros de uma vez", apps: [app("WhatsApp", /whatsapp/i), DISCORD, app("Telegram", /telegram/i), app("Slack", /slack/i)] },
  { id: "codigo", name: "Código", icon: "lib:code", blurb: "Editor, terminal e o Claude", apps: [app("VS Code", /visual studio code|vscode|^code$/i), app("Terminal", /terminal|git bash|powershell/i), CLAUDE, CHROME] },
  { id: "criacao", name: "Criação", icon: "lib:rocket", blurb: "Design e arte", apps: [app("Figma", /figma/i), app("Photoshop", /photoshop/i), app("Blender", /blender/i)] },
];

/** Quantos apps de um grupo precisam existir para valer a pena criá-lo. */
export const MIN_GROUP = 2;

export interface ResolvedApp {
  label: string;
  /** O atalho que você já tem para este app. */
  shortcutId?: string;
  /** O app instalado que será adicionado como atalho. */
  app?: AppEntry;
}

export interface ResolvedTemplate {
  apps: ResolvedApp[];
  found: number;
  /** Já existe um grupo com esse nome. */
  exists: boolean;
  /** Quantos dos apps encontrados ainda não estão nesse grupo que já existe (dá para completá-lo). */
  missing: number;
}

const sameApp = (shortcut: Shortcut, entry: AppEntry) =>
  cleanTarget(shortcut.target).toLowerCase() === entry.target.toLowerCase() || shortcut.name.trim().toLowerCase() === entry.name.trim().toLowerCase();

/** Para cada app do modelo: o atalho que você já tem, ou o app instalado que seria adicionado, ou nada. */
export function resolveTemplate(template: GroupTemplate, shortcuts: Shortcut[], apps: AppEntry[]): ResolvedTemplate {
  const resolved = template.apps.map<ResolvedApp>((wanted) => {
    const own = shortcuts.find((s) => !s.group && (wanted.match.test(s.name) || wanted.match.test(cleanTarget(s.target))));
    if (own) return { label: wanted.label, shortcutId: own.id };
    const installed = apps.find((a) => wanted.match.test(a.name));
    return installed ? { label: wanted.label, app: installed } : { label: wanted.label };
  });
  // O mesmo atalho não entra duas vezes no grupo.
  const seen = new Set<string>();
  const unique = resolved.map((r) => {
    const key = r.shortcutId ?? r.app?.target;
    if (!key) return r;
    if (seen.has(key)) return { label: r.label };
    seen.add(key);
    return r;
  });
  const group = shortcuts.find((s) => s.group && s.name.trim().toLowerCase() === template.name.toLowerCase());
  return {
    apps: unique,
    found: unique.filter((r) => r.shortcutId || r.app).length,
    exists: !!group,
    // Um app com atalho já feito conta como membro se o atalho está no grupo; um app ainda sem atalho sempre falta.
    missing: group ? unique.filter((r) => (r.shortcutId ? !group.members.includes(r.shortcutId) : !!r.app)).length : 0,
  };
}

const newShortcut = (entry: AppEntry, id: string): Shortcut => ({ id, name: entry.name, target: entry.target, icon: "", group: false, members: [] });

/** A lista com o grupo criado e, antes dele, os atalhos dos apps que você ainda não tinha. */
export function buildGroup(template: GroupTemplate, shortcuts: Shortcut[], apps: AppEntry[], makeId: () => string): Shortcut[] {
  const resolved = resolveTemplate(template, shortcuts, apps);
  if (resolved.found < MIN_GROUP || resolved.exists) return shortcuts;
  const added: Shortcut[] = [];
  const members: string[] = [];
  for (const item of resolved.apps) {
    if (item.shortcutId) members.push(item.shortcutId);
    else if (item.app) {
      const created = newShortcut(item.app, makeId());
      added.push(created);
      members.push(created.id);
    }
  }
  const group: Shortcut = { id: makeId(), name: template.name, target: "", icon: template.icon, group: true, members };
  return [...shortcuts, ...added, group];
}

/** Põe no grupo que já existe os apps do modelo que ainda não estavam nele (criando os atalhos que faltam). */
export function completeGroup(template: GroupTemplate, shortcuts: Shortcut[], apps: AppEntry[], makeId: () => string): Shortcut[] {
  const resolved = resolveTemplate(template, shortcuts, apps);
  const group = shortcuts.find((s) => s.group && s.name.trim().toLowerCase() === template.name.toLowerCase());
  if (!group || resolved.missing === 0) return shortcuts;
  const added: Shortcut[] = [];
  const members = [...group.members];
  for (const item of resolved.apps) {
    if (item.shortcutId) {
      if (!members.includes(item.shortcutId)) members.push(item.shortcutId);
    } else if (item.app) {
      const created = newShortcut(item.app, makeId());
      added.push(created);
      members.push(created.id);
    }
  }
  return [...shortcuts.map((s) => (s.id === group.id ? { ...group, members } : s)), ...added];
}

/** Os apps mais usados que ainda não são atalhos (só os que têm algum sinal de uso, ou os primeiros por nome). */
export function suggestedApps(apps: AppEntry[], shortcuts: Shortcut[], limit = 10): AppEntry[] {
  const fresh = apps.filter((entry) => !shortcuts.some((s) => !s.group && sameApp(s, entry)));
  const used = fresh.filter((entry) => entry.uses > 0 || entry.pinned || entry.running);
  return (used.length > 0 ? used : fresh).slice(0, limit);
}

/** Por que um app foi sugerido, em poucas palavras. */
export function whySuggested(entry: AppEntry): string {
  if (entry.pinned && entry.running) return "fixado na barra e aberto agora";
  if (entry.pinned) return "fixado na barra de tarefas";
  if (entry.running) return "aberto agora";
  if (entry.uses > 0) return `aberto ${entry.uses} ${entry.uses === 1 ? "vez" : "vezes"}`;
  return "instalado";
}

export const addApp = (shortcuts: Shortcut[], entry: AppEntry, makeId: () => string): Shortcut[] => [...shortcuts, newShortcut(entry, makeId())];

interface AppsStore {
  apps: AppEntry[];
  loaded: boolean;
  loading: boolean;
  load: () => Promise<void>;
}

/** Os apps instalados, lidos uma vez (a leitura passa pelo Menu Iniciar e pode levar um instante). */
export const useAppsStore = create<AppsStore>((set, get) => ({
  apps: [],
  loaded: false,
  loading: false,
  load: async () => {
    if (get().loaded || get().loading) return;
    set({ loading: true });
    try {
      set({ apps: await ipc.listApps(), loaded: true, loading: false });
    } catch {
      set({ loading: false });
    }
  },
}));

/** Carrega a lista de apps instalados quando a tela de sugestões abre. */
export function useInstalledApps(): AppEntry[] {
  const { apps, load } = useAppsStore();
  useEffect(() => void load(), [load]);
  return apps;
}
