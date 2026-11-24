import { t } from "../i18n";
export type SessionState = "running" | "idle";

export interface Session {
  id: string;
  /** Nome da pasta do projeto (último trecho do cwd). */
  project: string;
  state: SessionState;
  /** Quando entrou no estado atual (ms, relógio do navegador). */
  since: number;
  /** The last tool it used in this turn (from PostToolUse); null right after your prompt. */
  tool?: string | null;
  /** Files edited in the current turn (Edit, Write and the like), each once. */
  edited?: string[];
  /** The last finished turn: how many files it edited and how long it took. */
  last?: TurnSummary;
}

/** What a finished turn did, for the Claude page: "editou 4 arquivos em 3 min". */
export interface TurnSummary {
  files: number;
  ms: number;
}

export interface ClaudeEvent {
  event: string;
  sessionId: string;
  cwd: string;
  toolName: string | null;
  /** The file a tool worked on (tool_input.file_path or notebook_path), when it has one. */
  file?: string | null;
}

/** Tools that change files: what counts toward "editou N arquivos". */
const EDIT_TOOLS = /^(Edit|MultiEdit|Write|NotebookEdit)$/;

/** The same file written in two ways (C:\a vs c:/a) counts once. */
const fileKey = (path: string) => path.replace(/\\/g, "/").toLowerCase();

export interface PermissionRequest {
  id: number;
  sessionId: string;
  cwd: string;
  toolName: string;
  summary: string;
  /** Claude's multiple-choice questions (AskUserQuestion), answered from the island. */
  questions?: Question[];
}

/** One of Claude's questions: the text, a short header, the choices, and whether several can be picked. */
export interface Question {
  question: string;
  header: string;
  options: { label: string; description: string }[];
  multiSelect: boolean;
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
  // A new prompt starts a turn with no tool yet; each tool use replaces the last one.
  const tool = e.event === "PostToolUse" ? (e.toolName ?? current?.tool ?? null) : e.event === "UserPromptSubmit" ? null : (current?.tool ?? null);
  // A new prompt starts counting files again; an edit adds its file once.
  let edited = e.event === "UserPromptSubmit" ? [] : (current?.edited ?? []);
  const file = e.file;
  if (e.event === "PostToolUse" && file && e.toolName && EDIT_TOOLS.test(e.toolName) && !edited.some((f) => fileKey(f) === fileKey(file))) {
    edited = [...edited, file];
  }
  // A turn that ends sums itself up; it ran since the session went to "running".
  const last = e.event === "Stop" && current?.state === "running" ? { files: edited.length, ms: Math.max(0, now - current.since) } : current?.last;
  if (
    current &&
    current.state === next &&
    current.project === project &&
    (current.tool ?? null) === tool &&
    (current.edited ?? []).length === edited.length &&
    current.last === last
  ) {
    return sessions;
  }
  return {
    ...sessions,
    [e.sessionId]: {
      id: e.sessionId,
      project,
      state: next,
      since: current?.state === next ? current.since : now,
      tool,
      edited,
      ...(last ? { last } : {}),
    },
  };
}

/** "42 s", "3 min", "1 h 05": how long a turn ran. */
export function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}`;
}

/** "editou 4 arquivos em 3 min", or "respondeu em 42 s" when it changed no file. */
export function describeTurn(turn: TurnSummary): string {
  const time = formatDuration(turn.ms);
  if (turn.files === 0) return t("respondeu em {time}", { time });
  return turn.files === 1 ? t("editou 1 arquivo em {time}", { time }) : t("editou {n} arquivos em {time}", { n: turn.files, time });
}

/** What Claude is doing, from its last tool: thinking (no tool yet), editing, running commands, reading, delegating. */
export type WorkKind = "think" | "edit" | "run" | "read" | "delegate";

export function workKind(tool: string | null | undefined): WorkKind {
  if (!tool) return "think";
  if (/^(Edit|MultiEdit|Write|NotebookEdit)$/.test(tool)) return "edit";
  if (/^(Bash|PowerShell|BashOutput|KillShell)$/.test(tool)) return "run";
  if (/^(Read|Grep|Glob|LS|WebFetch|WebSearch)$/.test(tool)) return "read";
  if (/^(Task|Agent)$/.test(tool)) return "delegate";
  return "edit";
}

/** Sessões em andamento, da que começou há mais tempo para a mais recente. */
export function runningSessions(sessions: Sessions): Session[] {
  return Object.values(sessions)
    .filter((s) => s.state === "running")
    .sort((a, b) => a.since - b.since);
}

/**
 * The sessions that just went from running to stopped, the last one to stop first. Each gets its own "terminou"
 * notice, even while other sessions keep running.
 */
export function finishedSessions(before: Sessions, after: Sessions): Session[] {
  return Object.values(after)
    .filter((s) => s.state === "idle" && before[s.id]?.state === "running")
    .sort((a, b) => b.since - a.since);
}
