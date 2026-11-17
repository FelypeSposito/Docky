import { describe, expect, it } from "vitest";
import { applyEvent, describeTurn, formatDuration, finishedSessions, projectName, runningSessions, workKind, type ClaudeEvent, type Sessions } from "./sessions";

const event = (name: string, sessionId = "s1", cwd = "C:\\dev\\docky"): ClaudeEvent => ({
  event: name,
  sessionId,
  cwd,
  toolName: null,
});

describe("projectName", () => {
  it("pega a última pasta, com barras do Windows ou do Unix", () => {
    expect(projectName("C:\\dev\\docky")).toBe("docky");
    expect(projectName("/home/ana/site/")).toBe("site");
    expect(projectName("")).toBe("projeto");
  });
});

describe("applyEvent", () => {
  it("o prompt do usuário coloca a sessão para rodar", () => {
    const s = applyEvent({}, event("UserPromptSubmit"), 100);
    expect(s.s1).toEqual({ id: "s1", project: "docky", state: "running", since: 100, tool: null, edited: [] });
  });

  it("não reinicia o relógio enquanto continua rodando", () => {
    const first = applyEvent({}, event("UserPromptSubmit"), 100);
    const again = applyEvent(first, event("PostToolUse"), 900);
    expect(again).toBe(first);
  });

  it("Stop deixa a sessão parada e SessionEnd a remove", () => {
    let s = applyEvent({}, event("UserPromptSubmit"), 100);
    s = applyEvent(s, event("Stop"), 200);
    expect(s.s1.state).toBe("idle");
    s = applyEvent(s, event("SessionEnd"), 300);
    expect(s).toEqual({});
  });

  it("ignora eventos desconhecidos e sem sessão", () => {
    const empty: Sessions = {};
    expect(applyEvent(empty, event("Qualquer"), 1)).toBe(empty);
    expect(applyEvent(empty, event("Stop", ""), 1)).toBe(empty);
  });
});

describe("o resumo do turno", () => {
  const tool = (toolName: string, file: string | null, sessionId = "s1"): ClaudeEvent => ({ event: "PostToolUse", sessionId, cwd: "C:\\dev\\docky", toolName, file });

  it("conta cada arquivo editado uma vez e mede o turno", () => {
    let s = applyEvent({}, event("UserPromptSubmit"), 1_000);
    s = applyEvent(s, tool("Edit", "C:\\dev\\docky\\a.ts"), 2_000);
    s = applyEvent(s, tool("Edit", "c:/dev/docky/a.ts"), 3_000);
    s = applyEvent(s, tool("Write", "C:\\dev\\docky\\b.ts"), 4_000);
    s = applyEvent(s, tool("Read", "C:\\dev\\docky\\c.ts"), 5_000);
    s = applyEvent(s, tool("Bash", null), 6_000);
    s = applyEvent(s, event("Stop"), 181_000);
    expect(s.s1.last).toEqual({ files: 2, ms: 180_000 });
    expect(describeTurn(s.s1.last!)).toBe("editou 2 arquivos em 3 min");
  });

  it("um pedido novo zera os arquivos, mas guarda o último resumo até acabar", () => {
    let s = applyEvent({}, event("UserPromptSubmit"), 0);
    s = applyEvent(s, tool("Edit", "a.ts"), 1);
    s = applyEvent(s, event("Stop"), 10_000);
    s = applyEvent(s, event("UserPromptSubmit"), 20_000);
    expect(s.s1.edited).toEqual([]);
    expect(s.s1.last).toEqual({ files: 1, ms: 10_000 });
    s = applyEvent(s, event("Stop"), 62_000);
    expect(s.s1.last).toEqual({ files: 0, ms: 42_000 });
    expect(describeTurn(s.s1.last!)).toBe("respondeu em 42 s");
  });

  it("um Stop sem turno rodando não inventa resumo", () => {
    const s = applyEvent({}, event("Stop"), 5);
    expect(s.s1.last).toBeUndefined();
  });

  it("escreve a duração curta", () => {
    expect(formatDuration(900)).toBe("1 s");
    expect(formatDuration(59_000)).toBe("59 s");
    expect(formatDuration(150_000)).toBe("3 min");
    expect(formatDuration(65 * 60_000)).toBe("1 h 05");
  });
});

describe("runningSessions e justFinished", () => {
  it("lista as que rodam, da mais antiga para a mais nova", () => {
    let s = applyEvent({}, event("UserPromptSubmit", "b"), 200);
    s = applyEvent(s, event("UserPromptSubmit", "a"), 100);
    expect(runningSessions(s).map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("avisa o fim de cada sessão, mesmo com outras rodando", () => {
    let before = applyEvent({}, event("UserPromptSubmit", "a", "C:\\dev\\site"), 1);
    before = applyEvent(before, event("UserPromptSubmit", "b"), 2);
    const oneStopped = applyEvent(before, event("Stop", "a", "C:\\dev\\site"), 3);
    expect(finishedSessions(before, oneStopped).map((s) => s.project)).toEqual(["site"]);
    const allStopped = applyEvent(oneStopped, event("Stop", "b"), 4);
    expect(finishedSessions(oneStopped, allStopped).map((s) => s.project)).toEqual(["docky"]);
  });

  it("uma sessão que já estava parada não avisa de novo", () => {
    const stopped = applyEvent(applyEvent({}, event("UserPromptSubmit"), 1), event("Stop"), 2);
    const started = applyEvent(stopped, event("SessionStart", "c"), 3);
    expect(finishedSessions(stopped, started)).toEqual([]);
  });
});

describe("o que o Claude está fazendo", () => {
  it("lembra a última ferramenta do turno e zera a cada pedido novo", () => {
    let s = applyEvent({}, { event: "UserPromptSubmit", sessionId: "a", cwd: "C:/dev/docky", toolName: null }, 0);
    expect(s.a.tool).toBeNull();
    s = applyEvent(s, { event: "PostToolUse", sessionId: "a", cwd: "C:/dev/docky", toolName: "Bash" }, 1);
    expect(s.a.tool).toBe("Bash");
    s = applyEvent(s, { event: "PostToolUse", sessionId: "a", cwd: "C:/dev/docky", toolName: "Edit" }, 2);
    expect(s.a.tool).toBe("Edit");
    s = applyEvent(s, { event: "UserPromptSubmit", sessionId: "a", cwd: "C:/dev/docky", toolName: null }, 3);
    expect(s.a.tool).toBeNull();
  });

  it("agrupa as ferramentas em pensar, editar, rodar, ler e delegar", () => {
    expect(workKind(null)).toBe("think");
    expect(workKind("Edit")).toBe("edit");
    expect(workKind("Write")).toBe("edit");
    expect(workKind("Bash")).toBe("run");
    expect(workKind("Grep")).toBe("read");
    expect(workKind("WebFetch")).toBe("read");
    expect(workKind("Task")).toBe("delegate");
    expect(workKind("mcp__qualquer__coisa")).toBe("edit");
  });
});
