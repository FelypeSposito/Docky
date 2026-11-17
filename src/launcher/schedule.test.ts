import { describe, expect, it } from "vitest";
import type { Shortcut, ShortcutSection } from "../config/types";
import { linkFrom, siteHost, siteName } from "./link";
import { dayPart, scheduledSection, scheduleFirst } from "./schedule";

const at = (hour: number) => new Date(2026, 10, 17, hour, 30);
const shortcut = (id: string): Shortcut => ({ id, name: id, target: id, icon: "", group: false, members: [] });
const section = (id: string, hours: string, members: string[]): ShortcutSection => ({ id, name: id, collapsed: false, members, hours });

describe("atalhos por horário", () => {
  it("divide o dia em manhã, tarde e noite", () => {
    expect(dayPart(at(4))).toBe("night");
    expect(dayPart(at(5))).toBe("morning");
    expect(dayPart(at(11))).toBe("morning");
    expect(dayPart(at(12))).toBe("afternoon");
    expect(dayPart(at(18))).toBe("night");
    expect(dayPart(at(23))).toBe("night");
  });

  it("escolhe a primeira seção marcada para agora que tenha atalhos", () => {
    const sections = [section("vazia", "morning", []), section("trabalho", "morning", ["a"]), section("jogos", "night", ["b"])];
    expect(scheduledSection(sections, at(9))?.id).toBe("trabalho");
    expect(scheduledSection(sections, at(21))?.id).toBe("jogos");
    expect(scheduledSection(sections, at(14))).toBeUndefined();
  });

  it("põe os atalhos da seção na frente, sem mudar a ordem de cada parte", () => {
    const list = ["a", "b", "c", "d"].map((id) => ({ item: shortcut(id) }));
    expect(scheduleFirst(list, section("s", "night", ["d", "b"])).map((e) => e.item.id)).toEqual(["b", "d", "a", "c"]);
    expect(scheduleFirst(list, undefined)).toBe(list);
  });
});

describe("colar um link vira atalho", () => {
  it("reconhece links e sites, não nomes de arquivo nem frases", () => {
    expect(linkFrom("https://github.com/FelypeSposito")).toBe("https://github.com/FelypeSposito");
    expect(linkFrom("youtube.com")).toBe("https://youtube.com/");
    expect(linkFrom("www.globo.com.br/esporte")).toBe("https://www.globo.com.br/esporte");
    expect(linkFrom("notas.txt")).toBeNull();
    expect(linkFrom("spotify")).toBeNull();
    expect(linkFrom("abrir o site.com")).toBeNull();
  });

  it("dá um nome e um endereço curto", () => {
    expect(siteName("https://www.youtube.com/watch?v=1")).toBe("Youtube");
    expect(siteName("https://web.whatsapp.com/")).toBe("Whatsapp");
    expect(siteHost("https://www.youtube.com/watch")).toBe("youtube.com");
  });
});
