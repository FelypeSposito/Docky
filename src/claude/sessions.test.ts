import { describe, expect, it } from "vitest";
import { applyEvent, justFinished, projectName, runningSessions, type ClaudeEvent, type Sessions } from "./sessions";

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
    expect(s.s1).toEqual({ id: "s1", project: "docky", state: "running", since: 100 });
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
