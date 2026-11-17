import { describe, expect, it } from "vitest";
import { applyEvent, justFinished, projectName, runningSessions, workKind, type ClaudeEvent, type Sessions } from "./sessions";

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
    expect(s.s1).toEqual({ id: "s1", project: "docky", state: "running", since: 100, tool: null });
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

describe("runningSessions e justFinished", () => {
  it("lista as que rodam, da mais antiga para a mais nova", () => {
    let s = applyEvent({}, event("UserPromptSubmit", "b"), 200);
    s = applyEvent(s, event("UserPromptSubmit", "a"), 100);
    expect(runningSessions(s).map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("avisa o fim só quando a última sessão para", () => {
    let before = applyEvent({}, event("UserPromptSubmit", "a"), 1);
    before = applyEvent(before, event("UserPromptSubmit", "b"), 2);
    const oneStopped = applyEvent(before, event("Stop", "a"), 3);
    expect(justFinished(before, oneStopped)).toBe(false);
    const allStopped = applyEvent(oneStopped, event("Stop", "b"), 4);
    expect(justFinished(oneStopped, allStopped)).toBe(true);
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
