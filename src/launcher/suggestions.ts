import { useEffect } from "react";
import { create } from "zustand";
import type { Shortcut } from "../config/types";
import { useConfigStore } from "../config/useConfig";
import { ipc } from "../lib/ipc";
import { cleanTarget } from "./model";

/** De onde veio um app instalado: o Menu Iniciar (e a Loja), a biblioteca da Steam ou a da Epic Games. */
export type AppKind = "app" | "steam" | "epic";

/** Um app instalado (do Menu Iniciar, da Área de Trabalho, da Steam ou da Epic), com os sinais de que você o usa. */
export interface AppEntry {
  name: string;
  /** O que abre o app: o atalho `.lnk`, `shell:AppsFolder\…`, `steam://rungameid/…` ou o endereço da Epic. */
  target: string;
  uses: number;
  pinned: boolean;
  running: boolean;
  kind?: AppKind;
  /** Um arquivo de onde sai o ícone (a arte do jogo na Steam, o executável na Epic), quando há um. */
  icon?: string | null;
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

/** Um atalho novo a partir de um app instalado. Os criados para um grupo nascem ocultos: só existem dentro dele. */
const newShortcut = (entry: AppEntry, id: string, hidden = false): Shortcut => ({
  id,
  name: entry.name,
  target: entry.target,
  icon: "",
  group: false,
  members: [],
  ...(hidden ? { hidden: true } : {}),
});

/** A lista com o grupo criado e, antes dele, os atalhos dos apps que você ainda não tinha. */
export function buildGroup(template: GroupTemplate, shortcuts: Shortcut[], apps: AppEntry[], makeId: () => string): Shortcut[] {
  const resolved = resolveTemplate(template, shortcuts, apps);
  if (resolved.found < MIN_GROUP || resolved.exists) return shortcuts;
  const added: Shortcut[] = [];
  const members: string[] = [];
  for (const item of resolved.apps) {
    if (item.shortcutId) members.push(item.shortcutId);
    else if (item.app) {
      const created = newShortcut(item.app, makeId(), true);
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
      const created = newShortcut(item.app, makeId(), true);
      added.push(created);
      members.push(created.id);
    }
  }
  return [...shortcuts.map((s) => (s.id === group.id ? { ...group, members } : s)), ...added];
}

/** Põe um app instalado num grupo: usa o atalho que você já tem para ele ou cria um, e o acrescenta aos itens. */
export function addAppToGroup(shortcuts: Shortcut[], groupId: string, entry: AppEntry, makeId: () => string): Shortcut[] {
  const group = shortcuts.find((s) => s.id === groupId && s.group);
  if (!group) return shortcuts;
  const own = shortcuts.find((s) => !s.group && sameApp(s, entry));
  const created = own ? null : newShortcut(entry, makeId(), true);
  const id = (own ?? created)!.id;
  if (group.members.includes(id)) return shortcuts;
  const updated = shortcuts.map((s) => (s.id === groupId ? { ...group, members: [...group.members, id] } : s));
  return created ? [...updated, created] : updated;
}

const kindOf = (entry: AppEntry): AppKind => entry.kind ?? "app";

/** Os apps mais usados que ainda não são atalhos (só os que têm algum sinal de uso, ou os primeiros por nome). Jogos ficam de fora. */
export function suggestedApps(apps: AppEntry[], shortcuts: Shortcut[], limit = 10): AppEntry[] {
  const fresh = apps.filter((entry) => kindOf(entry) === "app" && !shortcuts.some((s) => !s.group && sameApp(s, entry)));
  const used = fresh.filter((entry) => entry.uses > 0 || entry.pinned || entry.running);
  return (used.length > 0 ? used : fresh).slice(0, limit);
}

export interface SuggestionSection {
  kind: AppKind;
  title: string;
  entries: AppEntry[];
}

/**
 * As sugestões de atalho por origem: os apps que você mais usa, os jogos da Steam e os da Epic Games, sem os que já
 * são atalhos. Seções vazias ficam de fora.
 */
export function suggestionSections(apps: AppEntry[], shortcuts: Shortcut[], appLimit = 12): SuggestionSection[] {
  const fresh = (kind: AppKind) => apps.filter((entry) => kindOf(entry) === kind && !shortcuts.some((s) => !s.group && sameApp(s, entry)));
  const sections: SuggestionSection[] = [
    { kind: "app", title: "Apps que você mais usa", entries: suggestedApps(apps, shortcuts, appLimit) },
    { kind: "steam", title: "Jogos da Steam", entries: fresh("steam") },
    { kind: "epic", title: "Jogos da Epic Games", entries: fresh("epic") },
  ];
  return sections.filter((section) => section.entries.length > 0);
}

/** Por que um app foi sugerido, em poucas palavras. */
export function whySuggested(entry: AppEntry): string {
  if (kindOf(entry) === "steam") return "jogo instalado na Steam";
  if (kindOf(entry) === "epic") return "jogo instalado na Epic Games";
  if (entry.pinned && entry.running) return "fixado na barra e aberto agora";
  if (entry.pinned) return "fixado na barra de tarefas";
  if (entry.running) return "aberto agora";
  if (entry.uses > 0) return `aberto ${entry.uses} ${entry.uses === 1 ? "vez" : "vezes"}`;
  return "instalado";
}

export const addApp = (shortcuts: Shortcut[], entry: AppEntry, makeId: () => string): Shortcut[] => [...shortcuts, newShortcut(entry, makeId())];

/** Vários apps de uma vez, no fim da lista e na ordem dada. Devolve a lista nova e os ids criados (na mesma ordem). */
export function addApps(shortcuts: Shortcut[], entries: AppEntry[], makeId: () => string): { shortcuts: Shortcut[]; ids: string[] } {
  const created = entries.map((entry) => newShortcut(entry, makeId()));
  return { shortcuts: [...shortcuts, ...created], ids: created.map((s) => s.id) };
}

/**
 * Dá ao atalho recém-criado o ícone do próprio app quando ele tem um arquivo de origem (a arte da Steam, o executável
 * da Epic). Relê a configuração na hora de gravar: só preenche se o atalho ainda existe e continua sem ícone. Sem
 * arquivo, quem preenche é a busca automática de ícones.
 */
export async function adoptAppIcon(id: string, entry: AppEntry): Promise<void> {
  if (!entry.icon) return;
  const icon = await ipc.adoptIcon(entry.icon, entry.name).catch(() => null);
  if (!icon) return;
  const { config, update } = useConfigStore.getState();
  const current = config.shortcuts.find((s) => s.id === id);
  if (!current || (current.icon ?? "").trim()) return;
  update({ shortcuts: config.shortcuts.map((s) => (s.id === id ? { ...s, icon } : s)) });
}

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

/**
 * Carrega a lista de apps instalados quando a tela de sugestões abre, só se a pessoa deixou o Docky procurar
 * (Configurações → Atalhos → Sugestões). Sem a permissão, a lista fica vazia.
 */
export function useInstalledApps(): AppEntry[] {
  const { apps, load } = useAppsStore();
  const allowed = useConfigStore((s) => s.config.scanApps);
  useEffect(() => {
    if (allowed) void load();
  }, [allowed, load]);
  return allowed ? apps : [];
}
