import { useCallback, useEffect, useRef, useState } from "react";
import { useConfigStore } from "../../config/useConfig";
import { formatNoteDate } from "../../lib/format";
import { ipc, type Note } from "../../lib/ipc";
import { EmptyState } from "../EmptyState";
import { NoteIcon } from "../icons";

/** Quantas notas a página carrega; a lista rola, então nenhuma some por falta de espaço. */
const MAX_NOTES = 80;

const pad = (n: number) => String(n).padStart(2, "0");
/** 2026-10-31-153042: vira o nome do arquivo e mantém as notas em ordem cronológica. */
const stamp = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function NotesPage({ active }: { active: boolean }) {
  const folder = useConfigStore((s) => s.config.notesFolder);
  const [notes, setNotes] = useState<Note[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(() => {
    ipc
      .notesRecent(MAX_NOTES)
      .then((list) => {
        setNotes(list);
        setError(null);
      })
      .catch((e) => setError(message(e)));
  }, []);

  useEffect(() => {
    if (active) refresh();
  }, [active, folder, refresh]);

  const save = () => {
    const value = text.trim();
    if (!value) return;
    ipc
      .notesSave(stamp(new Date()), value)
      .then(() => {
        setText("");
        refresh();
        listRef.current?.scrollTo({ top: 0, behavior: "smooth" }); // a nota nova fica no começo
      })
      .catch((e) => setError(message(e)));
  };

  return (
    <div className="bento nt">
      <label className="tile nin">
        <span className="nin-ic">
          <NoteIcon size={16} />
        </span>
        <input
          value={text}
          placeholder={notes.length > 0 ? `Nota rápida… (${notes.length} salvas)` : "Nota rápida…"}
          autoComplete="off"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
        />
        <kbd>Enter</kbd>
      </label>

      {error ? (
        <EmptyState
          title={folder ? "Não consegui acessar as notas" : "Falta a pasta das notas"}
          text={error}
          action={{ label: "Abrir configurações", onClick: () => ipc.openSettings() }}
        />
      ) : notes.length === 0 ? (
        <EmptyState title="Nenhuma nota ainda" text="Escreva acima e aperte Enter." />
      ) : (
        <div className="nlist" ref={listRef}>
          {notes.map((note) => (
            <button
              key={note.file}
              className="tile ncard"
              title={`${note.text}\n\nClique para abrir no Obsidian`}
              onClick={() => ipc.notesOpen(note.file).catch((e) => setError(message(e)))}
            >
              <p>{note.text}</p>
              <em>{formatNoteDate(note.modifiedMs)}</em>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
