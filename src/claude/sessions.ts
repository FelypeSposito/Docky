export type SessionState = "running" | "idle";

export interface Session {
  id: string;
  /** Nome da pasta do projeto (último trecho do cwd). */
  project: string;
  state: SessionState;
  /** Quando entrou no estado atual (ms, relógio do navegador). */
  since: number;
}

export interface ClaudeEvent {
  event: string;
  sessionId: string;
  cwd: string;
  toolName: string | null;
}

export interface PermissionRequest {
  id: number;
  sessionId: string;
  cwd: string;
  toolName: string;
  summary: string;
}

export type Sessions = Record<string, Session>;

export function projectName(cwd: string): string {
  const parts = cwd.split(/[\\/]+/).filter(Boolean);
  return parts[parts.length - 1] ?? "projeto";
}

/** Atualiza as sessões a partir de um evento dos hooks. Devolve o mesmo objeto se nada mudou. */
export function applyEvent(sessions: Sessions, e: ClaudeEvent, now: number): Sessions {
  if (!e.sessionId) return sessions;
  const current = sessions[e.sessionId];

  if (e.event === "SessionEnd") {
    if (!current) return sessions;
    const { [e.sessionId]: _removed, ...rest } = sessions;
    return rest;
  }

  const next: SessionState | null =
    e.event === "UserPromptSubmit" || e.event === "PostToolUse" || e.event === "PermissionRequest"
      ? "running"
      : e.event === "Stop" || e.event === "SessionStart"
        ? "idle"
        : null;
  if (!next) return sessions;

  const project = e.cwd ? projectName(e.cwd) : (current?.project ?? "projeto");
  if (current && current.state === next && current.project === project) return sessions;
  return {
    ...sessions,
    [e.sessionId]: { id: e.sessionId, project, state: next, since: current?.state === next ? current.since : now },
  };
}

/** Sessões em andamento, da que começou há mais tempo para a mais recente. */
export function runningSessions(sessions: Sessions): Session[] {
  return Object.values(sessions)
    .filter((s) => s.state === "running")
    .sort((a, b) => a.since - b.since);
}

/** Há sessões que acabaram de passar de "rodando" para "parada" e nenhuma outra continua rodando? */
export function justFinished(before: Sessions, after: Sessions): boolean {
  const wasRunning = Object.values(before).some((s) => s.state === "running");
  return wasRunning && runningSessions(after).length === 0;
}
