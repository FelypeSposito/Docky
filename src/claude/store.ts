import { create } from "zustand";
import { ipc } from "../lib/ipc";
import { useIslandStore } from "../island/store";
import { applyEvent, type ClaudeEvent, finishedSessions, type PermissionRequest, type Session, type Sessions } from "./sessions";

const DONE_NOTICE_MS = 4200;
/** How long Clawd celebrates a finished session or sulks after you deny. */
const REACTION_MS = 4200;

export type Reaction = { kind: "celebrate" | "sad"; until: number };

interface ClaudeStore {
  sessions: Sessions;
  /** Pedidos de permissão esperando você, o mais antigo primeiro. */
  permissions: (PermissionRequest & { project: string })[];
  /** Quantas vezes você negou: faz os olhinhos balançarem a cabeça. */
  denials: number;
  /** Clawd's latest reaction (a session finished, you denied), until `until` (performance.now). */
  reaction: Reaction | null;
  /** The session the "terminou" notice is about: its project and what the turn did. */
  finished: Session | null;
  onEvent: (event: ClaudeEvent) => void;
  addPermission: (request: PermissionRequest) => void;
  dropPermission: (id: number) => void;
  /** Allow or deny; or answer Claude's questions (`answers`); or leave it to the terminal (`terminal`). */
  decide: (id: number, allow: boolean, extra?: { answers?: Record<string, string>; terminal?: boolean }) => void;
}

const lastSegment = (cwd: string) => cwd.split(/[\\/]+/).filter(Boolean).pop() ?? "projeto";

export const useClaudeStore = create<ClaudeStore>((set, get) => ({
  sessions: {},
  permissions: [],
  denials: 0,
  reaction: null,
  finished: null,

  onEvent: (event) => {
    const before = get().sessions;
    const after = applyEvent(before, event, performance.now());
    if (after === before) return;
    set({ sessions: after });
    // Every session that finishes gets its notice, naming its project, even while others keep running.
    const [finished] = finishedSessions(before, after);
    if (finished && get().permissions.length === 0) {
      set({ finished, reaction: { kind: "celebrate", until: performance.now() + REACTION_MS } });
      useIslandStore.getState().showOverlay("done", DONE_NOTICE_MS);
    }
  },

  addPermission: (request) =>
    set((s) =>
      s.permissions.some((p) => p.id === request.id)
        ? s
        : { permissions: [...s.permissions, { ...request, project: lastSegment(request.cwd) }] },
    ),

  dropPermission: (id) => set((s) => ({ permissions: s.permissions.filter((p) => p.id !== id) })),

  decide: (id, allow, extra) => {
    ipc.claudeDecide(id, allow, extra);
    // Only a real "no" makes Clawd sad: sending the question to the terminal is not one.
    const denied = !allow && !extra?.terminal;
    set((s) => ({
      permissions: s.permissions.filter((p) => p.id !== id),
      denials: denied ? s.denials + 1 : s.denials,
      reaction: denied ? { kind: "sad", until: performance.now() + REACTION_MS } : s.reaction,
    }));
  },
}));

/** Liga os eventos do Rust ao estado. Chame uma vez, na ilha. */
export function startClaudeSync(): () => void {
  const { onEvent, addPermission, dropPermission } = useClaudeStore.getState();
  const offs = [ipc.onClaudeEvent(onEvent), ipc.onClaudePermission(addPermission), ipc.onClaudePermissionCancel(dropPermission)];
  return () => offs.forEach((off) => off());
}
