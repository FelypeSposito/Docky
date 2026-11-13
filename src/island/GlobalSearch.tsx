import { type ReactNode, useEffect, useMemo, useState } from "react";
import { useConfigStore } from "../config/useConfig";
import { useFocusStore } from "../focus/store";
import { LABELS } from "../focus/timer";
import { filterShortcuts } from "../launcher/filter";
import { useShortcutImages } from "../launcher/icons";
import { confirmationText, needsConfirmation } from "../launcher/model";
import { SHORTCUT_COLORS, ShortcutIcon } from "../launcher/ShortcutIcon";
import { ipc, type Note } from "../lib/ipc";
import { useMediaStore } from "../media/store";
import { HeaderField } from "./HeaderField";
import { GearIcon, NextIcon, NoteIcon, PauseIcon, PlayIcon, SearchIcon, TimerIcon } from "./icons";
import { visiblePages } from "./pageOrder";
import { PAGES } from "./pages/registry";
import { type Candidate, noteTitle, rank } from "./search";
import { useIslandStore } from "./store";

interface Item extends Candidate {
  icon: ReactNode;
  detail?: string;
  run: () => void;
}

const KIND_LABEL: Record<Item["kind"], string> = { shortcut: "Atalho", page: "Página", note: "Nota", action: "Ação" };
const MAX_NOTES = 40;

const pad = (n: number) => String(n).padStart(2, "0");
const stamp = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

/**
 * A busca geral, no cabeçalho das páginas que não têm um campo próprio: acha atalhos, páginas, notas e ações
 * ("iniciar foco", "pausar música"). Comece a digitar com a ilha aberta; as setas escolhem e Enter faz.
 */
export function GlobalSearch({ active }: { active: boolean }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  /** O atalho que pediu confirmação: um segundo Enter (ou clique) abre. */
  const [confirming, setConfirming] = useState<string | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const config = useConfigStore((s) => s.config);
  const images = useShortcutImages(config.shortcuts);
  const timer = useFocusStore();
  const playing = useMediaStore((s) => !!s.media?.playing);
  const hasMedia = useMediaStore((s) => !!s.media);
  const searching = query.trim() !== "";

  useEffect(() => {
    if (!active) setQuery("");
  }, [active]);
  // As notas só são lidas quando a busca começa.
  useEffect(() => {
    if (searching && notes.length === 0) ipc.notesRecent(MAX_NOTES).then(setNotes).catch(() => {});
  }, [searching, notes.length]);

  const done = () => {
    setQuery("");
    setConfirming(null);
  };

  const items = useMemo<Item[]>(() => {
    const list: Item[] = [];
    for (const { item, index } of filterShortcuts(config.shortcuts, "")) {
      list.push({
        id: `s:${item.id || index}`,
        kind: "shortcut",
        title: item.name,
        detail: item.group ? confirmationText(item, config.shortcuts) : undefined,
        icon: <ShortcutIcon shortcut={item} image={images[index]} color={SHORTCUT_COLORS[index % SHORTCUT_COLORS.length]} className="li" />,
        run: () => {
          const id = `s:${item.id || index}`;
          if (needsConfirmation(item, config.shortcuts, config.confirmApps) && confirming !== id) {
            setConfirming(id);
            return;
          }
          ipc.launch(index).catch(() => {});
          done();
          useIslandStore.getState().collapse();
        },
      });
    }
    list.push({
      id: "a:timer",
      kind: "action",
      title: timer.running ? `Pausar o ${LABELS[timer.mode]}` : `Iniciar ${LABELS[timer.mode] === "Foco" ? "o Foco" : LABELS[timer.mode]} (${Math.round(timer.total / 60)} min)`,
      keywords: "foco pomodoro timer contador pausa",
      icon: <TimerIcon size={15} />,
      run: () => {
        timer.toggle();
        done();
      },
    });
    if (hasMedia) {
      list.push({
        id: "a:play",
        kind: "action",
        title: playing ? "Pausar a música" : "Tocar a música",
        keywords: "musica play pause tocar parar",
        icon: playing ? <PauseIcon size={14} /> : <PlayIcon size={14} />,
        run: () => {
          ipc.mediaControl("toggle");
          done();
        },
      });
      list.push({
        id: "a:next",
        kind: "action",
        title: "Próxima música",
        keywords: "musica pular avancar faixa",
        icon: <NextIcon size={14} />,
        run: () => {
          ipc.mediaControl("next");
          done();
        },
      });
    }
    list.push({
      id: "a:settings",
      kind: "action",
      title: "Abrir as Configurações",
      keywords: "ajustes opcoes preferencias config",
      icon: <GearIcon size={15} />,
      run: () => {
        ipc.openSettings();
        done();
      },
    });
    for (const { id, label, Icon } of visiblePages(PAGES, config.pageOrder, config.hiddenPages)) {
      list.push({
        id: `p:${id}`,
        kind: "page",
        title: label,
        icon: <Icon size={15} />,
        run: () => {
          useIslandStore.getState().setPage(id);
          done();
        },
      });
    }
    for (const note of notes) {
      list.push({
        id: `n:${note.file}`,
        kind: "note",
        title: noteTitle(note.text),
        keywords: note.text.slice(0, 400),
        icon: <NoteIcon size={15} />,
        run: () => {
          ipc.notesOpen(note.file).catch(() => {});
          done();
        },
      });
    }
    return list;
  }, [config.shortcuts, config.confirmApps, config.pageOrder, config.hiddenPages, images, timer, playing, hasMedia, notes, confirming]);

  const results = useMemo(() => {
    if (!searching) return [];
    const found = rank(items, query, 6);
    // Sempre dá para guardar o que foi digitado como nota.
    if (query.trim().length >= 3) {
      found.push({
        id: "a:note",
        kind: "action",
        title: `Salvar como nota: “${query.trim()}”`,
        icon: <NoteIcon size={15} />,
        run: () => {
          ipc.notesSave(stamp(new Date()), query.trim()).then(() => setNotes([])).catch(() => {});
          done();
        },
      });
    }
    return found;
  }, [items, query, searching]);

  const index = Math.min(selected, Math.max(0, results.length - 1));

  return (
    <>
      <HeaderField
        icon={<SearchIcon />}
        value={query}
        label="Buscar no Docky"
        placeholder="Buscar no Docky"
        onChange={(value) => {
          setQuery(value);
          setSelected(0);
          setConfirming(null);
        }}
        onEnter={() => results[index]?.run()}
        onKeyDown={(e) => {
          if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
          e.preventDefault();
          setConfirming(null);
          setSelected((i) => (results.length === 0 ? 0 : (i + (e.key === "ArrowDown" ? 1 : results.length - 1)) % results.length));
        }}
        typeToFocus
      />
      {searching && (
        <div className="gs" role="listbox" aria-label="Resultados da busca">
          {results.length === 0 ? (
            <p className="gs-none">Nada com “{query.trim()}”.</p>
          ) : (
            results.map((item, i) => (
              <button
                key={item.id}
                role="option"
                aria-selected={i === index}
                className={`gs-row${i === index ? " on" : ""}`}
                onMouseEnter={() => setSelected(i)}
                onClick={item.run}
              >
                <span className={`gs-ic ${item.kind}`}>{item.icon}</span>
                <span className="gs-t">
                  <b>{item.title}</b>
                  {confirming === item.id ? <em className="ask">Enter de novo para abrir</em> : item.detail && <em>{item.detail}</em>}
                </span>
                <i>{KIND_LABEL[item.kind]}</i>
              </button>
            ))
          )}
        </div>
      )}
    </>
  );
}
