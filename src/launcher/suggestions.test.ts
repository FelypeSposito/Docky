import { describe, expect, it } from "vitest";
import type { Shortcut } from "../config/types";
import { type AppEntry, MIN_GROUP, TEMPLATES, addApp, addAppToGroup, buildGroup, completeGroup, resolveTemplate, suggestedApps, whySuggested } from "./suggestions";

const app = (name: string, extra: Partial<AppEntry> = {}): AppEntry => ({ name, target: `C:\\Menu\\${name}.lnk`, uses: 0, pinned: false, running: false, ...extra });
const shortcut = (id: string, name: string, target = "", extra: Partial<Shortcut> = {}): Shortcut => ({ id, name, target, icon: "", group: false, members: [], ...extra });
const ids = () => {
  let n = 0;
  return () => `id${++n}`;
};
const work = TEMPLATES.find((t) => t.id === "trabalho")!;
const games = TEMPLATES.find((t) => t.id === "jogos")!;

describe("grupos sugeridos", () => {
  it("usa o atalho que já existe e o app instalado para o resto", () => {
    const resolved = resolveTemplate(work, [shortcut("a", "Google Chrome", "C:\\chrome.exe")], [app("Spotify"), app("Obsidian"), app("Calculadora")]);
    expect(resolved.apps.map((r) => [r.label, r.shortcutId ?? r.app?.name ?? null])).toEqual([
      ["Claude", null],
      ["Chrome", "a"],
      ["Spotify", "Spotify"],
      ["Obsidian", "Obsidian"],
    ]);
    expect(resolved.found).toBe(3);
    expect(resolved.exists).toBe(false);
  });

  it("cria os atalhos que faltam e o grupo, na ordem do modelo", () => {
    const list = buildGroup(games, [shortcut("a", "Discord", "C:\\discord.exe")], [app("Spotify"), app("Steam")], ids());
    expect(list.map((s) => s.name)).toEqual(["Discord", "Spotify", "Steam", "Jogos"]);
    const group = list[list.length - 1];
    expect(group.group).toBe(true);
    expect(group.icon).toBe("lib:game");
    // Spotify, Steam e Discord, nesta ordem (a do modelo)
    expect(group.members.map((id) => list.find((s) => s.id === id)?.name)).toEqual(["Spotify", "Steam", "Discord"]);
  });

  it("não cria com poucos apps nem repete um grupo que já existe", () => {
    expect(MIN_GROUP).toBe(2);
    const few = [shortcut("a", "Steam", "C:\\steam.exe")];
    expect(buildGroup(games, few, [], ids())).toBe(few);
    const have = [shortcut("a", "Steam"), shortcut("b", "Discord"), shortcut("g", "Jogos", "", { group: true, members: ["a", "b"] })];
    expect(resolveTemplate(games, have, []).exists).toBe(true);
    expect(buildGroup(games, have, [], ids())).toBe(have);
  });

  it("não põe o mesmo app duas vezes no grupo", () => {
    // "Chrome" e "Google Chrome" casam com o mesmo atalho
    const resolved = resolveTemplate(TEMPLATES.find((t) => t.id === "codigo")!, [shortcut("a", "Chrome", "C:\\chrome.exe")], []);
    expect(resolved.apps.filter((r) => r.shortcutId === "a")).toHaveLength(1);
  });
});

describe("apps sugeridos", () => {
  it("tira os que já são atalhos e fica com os que têm sinal de uso", () => {
    const apps = [app("Chrome", { pinned: true }), app("Spotify", { uses: 40 }), app("Calculadora"), app("Discord", { running: true })];
    const have = [shortcut("a", "Spotify", "C:\\Menu\\Spotify.lnk")];
    expect(suggestedApps(apps, have).map((a) => a.name)).toEqual(["Chrome", "Discord"]);
  });

  it("sem nenhum sinal de uso, sugere os primeiros da lista", () => {
    expect(suggestedApps([app("A"), app("B"), app("C")], [], 2).map((a) => a.name)).toEqual(["A", "B"]);
  });

  it("explica o motivo e adiciona como atalho", () => {
    expect(whySuggested(app("X", { pinned: true, running: true }))).toBe("fixado na barra e aberto agora");
    expect(whySuggested(app("X", { uses: 1 }))).toBe("aberto 1 vez");
    expect(whySuggested(app("X"))).toBe("instalado");
    const next = addApp([], app("Obsidian"), ids());
    expect(next).toEqual([{ id: "id1", name: "Obsidian", target: "C:\\Menu\\Obsidian.lnk", icon: "", group: false, members: [] }]);
  });
});

describe("completar um grupo que já existe", () => {
  const code = TEMPLATES.find((t) => t.id === "codigo")!;
  const base = [
    shortcut("v", "Visual Studio Code", "C:\\vscode.lnk"),
    shortcut("t", "Developer PowerShell", "C:\\ps.lnk"),
    shortcut("c", "Google Chrome", "C:\\chrome.lnk"),
    shortcut("g", "Código", "", { group: true, members: ["v", "t", "c"] }),
  ];

  it("põe o app que faltava (o Claude da Loja) no grupo, criando o atalho", () => {
    const apps = [app("Claude", { target: "shell:AppsFolder\\Claude_x!Claude" })];
    expect(resolveTemplate(code, base, apps)).toMatchObject({ exists: true, missing: 1 });
    const list = completeGroup(code, base, apps, ids());
    const group = list.find((s) => s.group)!;
    expect(list.map((s) => s.name)).toEqual(["Visual Studio Code", "Developer PowerShell", "Google Chrome", "Código", "Claude"]);
    expect(group.members.map((id) => list.find((s) => s.id === id)?.name)).toEqual(["Visual Studio Code", "Developer PowerShell", "Google Chrome", "Claude"]);
  });

  it("usa um atalho que você já tem mas ainda não estava no grupo", () => {
    const have = [...base.slice(0, 3), shortcut("k", "Claude", "shell:AppsFolder\\Claude_x!Claude"), base[3]];
    const list = completeGroup(code, have, [], ids());
    expect(list).toHaveLength(have.length); // nenhum atalho novo
    expect(list.find((s) => s.group)!.members).toEqual(["v", "t", "c", "k"]);
  });

  it("não muda nada quando o grupo já está completo ou não existe", () => {
    expect(resolveTemplate(code, base, []).missing).toBe(0);
    expect(completeGroup(code, base, [], ids())).toBe(base);
    expect(completeGroup(code, [], [app("Claude")], ids())).toEqual([]);
  });
});

describe("app instalado direto num grupo", () => {
  const list = [shortcut("a", "Chrome", "C:\\Menu\\Chrome.lnk"), shortcut("g", "Trabalho", "", { group: true, members: ["a"] })];

  it("cria o atalho e o põe no grupo", () => {
    const next = addAppToGroup(list, "g", app("Claude"), ids());
    expect(next.map((s) => s.name)).toEqual(["Chrome", "Trabalho", "Claude"]);
    expect(next[1].members).toEqual(["a", "id1"]);
  });

  it("usa o atalho que já existe e não repete um item", () => {
    const have = [...list, shortcut("k", "Claude", "C:\\Menu\\Claude.lnk")];
    const next = addAppToGroup(have, "g", app("Claude"), ids());
    expect(next).toHaveLength(have.length);
    expect(next[1].members).toEqual(["a", "k"]);
    expect(addAppToGroup(next, "g", app("Claude"), ids())).toBe(next);
    expect(addAppToGroup(list, "zzz", app("Claude"), ids())).toBe(list);
  });
});
