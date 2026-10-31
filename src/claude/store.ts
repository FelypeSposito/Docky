import { create } from "zustand";
import { ipc } from "../lib/ipc";
import { useIslandStore } from "../island/store";
import { applyEvent, type ClaudeEvent, justFinished, type PermissionRequest, type Sessions } from "./sessions";

const DONE_NOTICE_MS = 4200;

interface ClaudeStore {
  sessions: Sessions;
  /** Pedidos de permissão esperando você, o mais antigo primeiro. */
  permissions: (PermissionRequest & { project: string })[];
  /** Quantas vezes você negou: faz os olhinhos balançarem a cabeça. */
  denials: number;
  onEvent: (event: ClaudeEvent) => void;
  addPermission: (request: PermissionRequest) => void;
  dropPermission: (id: number) => void;
  decide: (id: number, allow: boolean) => void;
}

const lastSegment = (cwd: string) => cwd.split(/[\\/]+/).filter(Boolean).pop() ?? "projeto";

export const useClaudeStore = create<ClaudeStore>((set, get) => ({
  sessions: {},
  permissions: [],
  denials: 0,

  onEvent: (event) => {
    const before = get().sessions;
    const after = applyEvent(before, event, performance.now());
    if (after === before) return;
    set({ sessions: after });
    if (justFinished(before, after) && get().permissions.length === 0) {
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

  decide: (id, allow) => {
    ipc.claudeDecide(id, allow);
    set((s) => ({
      permissions: s.permissions.filter((p) => p.id !== id),
      denials: allow ? s.denials : s.denials + 1,
    }));
  },
}));

/** Liga os eventos do Rust ao estado. Chame uma vez, na ilha. */
export function startClaudeSync(): () => void {
  const { onEvent, addPermission, dropPermission } = useClaudeStore.getState();
  const offs = [ipc.onClaudeEvent(onEvent), ipc.onClaudePermission(addPermission), ipc.onClaudePermissionCancel(dropPermission)];
  return () => offs.forEach((off) => off());
}
