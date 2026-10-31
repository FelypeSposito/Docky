import { useCallback, useEffect, useState } from "react";
import { useConfigStore } from "../../config/useConfig";
import { ipc, type Note } from "../../lib/ipc";
import { NoteIcon } from "../icons";

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

  const refresh = useCallback(() => {
    ipc
      .notesRecent(3)
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
          placeholder="Nota rápida…"
          autoComplete="off"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
        />
        <kbd>Enter</kbd>
      </label>

      {error ? (
        <div className="tile soon">
          <b>{folder ? "Não consegui acessar as notas" : "Falta escolher a pasta das notas"}</b>
          <span>{error}</span>
          <button className="btn" onClick={() => ipc.openSettings()}>
            Abrir configurações
          </button>
        </div>
      ) : (
        <div className="ncards">
          {notes.length === 0 && <div className="tile ncard empty">Suas notas aparecem aqui.</div>}
          {notes.map((note) => (
            <div key={note.file} className="tile ncard" title={note.text}>
              <p>{note.text}</p>
              <em>{note.file.replace(/\.md$/, "")}</em>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
