import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useConfigStore } from "../../config/useConfig";
import { formatNoteDate } from "../../lib/format";
import { ipc, type Note } from "../../lib/ipc";
import { orderNotes, togglePinned } from "../../notes/order";
import { EmptyState } from "../EmptyState";
import { NoteIcon, PinIcon, TrashIcon } from "../icons";

/** Quantas notas a página carrega; a lista rola, então nenhuma some por falta de espaço. */
const MAX_NOTES = 80;

const pad = (n: number) => String(n).padStart(2, "0");
/** 2026-10-31-153042: vira o nome do arquivo e mantém as notas em ordem cronológica. */
const stamp = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** A versão maior das Notas: mais colunas e mais texto de cada nota à vista. */
export function NotesLarge({ active }: { active: boolean }) {
  return <NotesPage active={active} large />;
}

export function NotesPage({ active, large = false }: { active: boolean; large?: boolean }) {
  const folder = useConfigStore((s) => s.config.notesFolder);
  const pinned = useConfigStore((s) => s.config.pinnedNotes);
  const update = useConfigStore((s) => s.update);
  const [notes, setNotes] = useState<Note[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  /** A nota que está pedindo confirmação para ser excluída. */
  const [confirming, setConfirming] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const ordered = useMemo(() => orderNotes(notes, pinned), [notes, pinned]);

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

  const remove = (file: string) => {
    setConfirming(null);
    ipc
      .notesDelete(file)
      .then(() => {
        if (pinned.includes(file)) update({ pinnedNotes: togglePinned(pinned, file) });
        refresh();
      })
      .catch((e) => setError(message(e)));
  };

  // Sair da página ou mexer na lista cancela uma exclusão que ficou esperando.
  useEffect(() => {
    if (!active) setConfirming(null);
  }, [active]);

  return (
    <div className={`bento nt${large ? " big" : ""}`}>
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
          action={{ label: "Abrir configurações", onClick: () => ipc.openSettings("geral") }}
        />
      ) : notes.length === 0 ? (
        <EmptyState title="Nenhuma nota ainda" text="Escreva acima e aperte Enter." />
      ) : (
        <div className="nlist" ref={listRef}>
          {ordered.map((note) => {
            const isPinned = pinned.includes(note.file);
            const stop = (e: React.SyntheticEvent) => e.stopPropagation();
            const open = () => ipc.notesOpen(note.file).catch((e) => setError(message(e)));
            return (
              <div
                key={note.file}
                className={`tile ncard${isPinned ? " pinned" : ""}`}
                role="button"
                tabIndex={0}
                title={`${note.text}\n\nClique para abrir no Obsidian`}
                onClick={open}
                onKeyDown={(e) => e.target === e.currentTarget && e.key === "Enter" && open()}
              >
                {confirming === note.file ? (
                  <div className="nconfirm" onClick={stop}>
                    <b>Excluir esta nota?</b>
                    <span>Ela vai para a Lixeira.</span>
                    <div>
                      <button className="nbtn" onClick={() => setConfirming(null)}>
                        Cancelar
                      </button>
                      <button className="nbtn danger" autoFocus onClick={() => remove(note.file)}>
                        Excluir
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p>{note.text}</p>
                    <em>{formatNoteDate(note.modifiedMs)}</em>
                    <div className="nact" onClick={stop}>
                      <button
                        className={isPinned ? "on" : ""}
                        aria-label={isPinned ? "Desafixar nota" : "Fixar nota no topo"}
                        title={isPinned ? "Desafixar" : "Fixar no topo"}
                        onClick={() => update({ pinnedNotes: togglePinned(pinned, note.file) })}
                      >
                        <PinIcon />
                      </button>
                      <button aria-label="Excluir nota" title="Excluir" onClick={() => setConfirming(note.file)}>
                        <TrashIcon />
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
