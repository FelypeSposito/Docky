import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useConfigStore } from "../../config/useConfig";
import { formatNoteDate } from "../../lib/format";
import { ipc, type Note } from "../../lib/ipc";
import { NOTE_COLORS, noteColor, paintNote } from "../../notes/colors";
import { nextNoteOrder, splitNotes, togglePinned } from "../../notes/order";
import { EmptyState } from "../EmptyState";
import { HeaderField } from "../HeaderField";
import { NoteIcon, PinIcon, TrashIcon } from "../icons";
import { useGridSort } from "../useGridSort";

/** Quantas notas a página carrega; a lista rola, então nenhuma some por falta de espaço. */
const MAX_NOTES = 80;

/** O `order` do CSS põe as notas fixadas antes das outras (cada grupo tem o seu intervalo). */
const GROUP_GAP = 1000;

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
  const colors = useConfigStore((s) => s.config.noteColors) ?? {};
  const update = useConfigStore((s) => s.update);
  const [notes, setNotes] = useState<Note[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  /** A nota que está pedindo confirmação para ser excluída. */
  const [confirming, setConfirming] = useState<string | null>(null);
  /** The note whose color palette is open. */
  const [painting, setPainting] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const manual = useConfigStore((s) => s.config.noteOrder);
  const groups = useMemo(() => splitNotes(notes, pinned, manual), [notes, pinned, manual]);
  const ordered = useMemo(() => [...groups.pinned, ...groups.rest], [groups]);
  // Arrastar muda a ordem dentro do grupo: as fixadas se ordenam entre si, e as outras entre si.
  const dragPinned = useGridSort(
    groups.pinned.map((n) => n.file),
    (order) => update({ noteOrder: nextNoteOrder(order, groups.rest.map((n) => n.file)) }),
  );
  const dragRest = useGridSort(
    groups.rest.map((n) => n.file),
    (order) => update({ noteOrder: nextNoteOrder(groups.pinned.map((n) => n.file), order) }),
  );

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
        if (colors[file]) update({ noteColors: paintNote(colors, file, null) });
        refresh();
      })
      .catch((e) => setError(message(e)));
  };

  // Sair da página ou mexer na lista cancela uma exclusão que ficou esperando.
  useEffect(() => {
    if (!active) {
      setConfirming(null);
      setPainting(null);
    }
  }, [active]);

  const paint = (file: string, color: string | null) => {
    setPainting(null);
    update({ noteColors: paintNote(colors, file, color) });
  };

  return (
    <div className={`bento nt${large ? " big" : ""}`}>
      <HeaderField
        icon={<NoteIcon size={14} />}
        value={text}
        label="Nota rápida"
        placeholder={notes.length > 0 ? `Nota rápida · ${notes.length} salvas` : "Nota rápida"}
        onChange={setText}
        onEnter={save}
        typeToFocus
      />

      {error ? (
        <EmptyState
          title={folder ? "Não consegui acessar as notas" : "Falta a pasta das notas"}
          text={error}
          action={{ label: "Abrir configurações", onClick: () => ipc.openSettings("geral") }}
        />
      ) : notes.length === 0 ? (
        <EmptyState title="Nenhuma nota ainda" text="Comece a digitar: a nota vai para o campo lá em cima, e Enter salva." />
      ) : (
        <div className="nlist" ref={listRef}>
          {ordered.map((note) => {
            const isPinned = pinned.includes(note.file);
            const color = noteColor(colors, note.file);
            const sorter = isPinned ? dragPinned : dragRest;
            const stop = (e: React.SyntheticEvent) => e.stopPropagation();
            const open = () => ipc.notesOpen(note.file).catch((e) => setError(message(e)));
            return (
              <div
                key={note.file}
                ref={sorter.tileRef(note.file)}
                className={`tile ncard${isPinned ? " pinned" : ""}${color ? " tinted" : ""}${sorter.dragId === note.file ? " drag" : ""}`}
                style={{ order: (isPinned ? 0 : GROUP_GAP) + (sorter.position.get(note.file) ?? 0), ...(color ? { "--nc": color.hex } : {}) } as React.CSSProperties}
                onPointerDown={(e) => sorter.down(e, note.file)}
                onMouseLeave={() => painting === note.file && setPainting(null)}
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
                ) : painting === note.file ? (
                  <div className="npaint" onClick={stop}>
                    <b>Cor da nota</b>
                    <div role="radiogroup" aria-label="Cor da nota">
                      <button
                        className={`nsw none${color ? "" : " on"}`}
                        role="radio"
                        aria-checked={!color}
                        aria-label="Sem cor"
                        title="Sem cor"
                        onClick={() => paint(note.file, null)}
                      />
                      {NOTE_COLORS.map((c) => (
                        <button
                          key={c.id}
                          className={`nsw${color?.id === c.id ? " on" : ""}`}
                          role="radio"
                          aria-checked={color?.id === c.id}
                          aria-label={c.label}
                          title={c.label}
                          style={{ "--sw": c.hex } as React.CSSProperties}
                          onClick={() => paint(note.file, c.id)}
                        />
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    <p>{note.text}</p>
                    <em>{formatNoteDate(note.modifiedMs)}</em>
                    <div className="nact" onClick={stop}>
                      <button aria-label="Mudar a cor da nota" title="Cor" onClick={() => setPainting(note.file)}>
                        <i className="ndot" />
                      </button>
                      <button className="del" aria-label="Excluir nota" title="Excluir" onClick={() => setConfirming(note.file)}>
                        <TrashIcon />
                      </button>
                      <button
                        className={isPinned ? "on" : ""}
                        aria-label={isPinned ? "Desafixar nota" : "Fixar nota no topo"}
                        title={isPinned ? "Desafixar" : "Fixar no topo"}
                        onClick={() => update({ pinnedNotes: togglePinned(pinned, note.file) })}
                      >
                        <PinIcon />
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
