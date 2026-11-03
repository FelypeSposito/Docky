import { useCallback, useMemo, useState } from "react";
import type { Shortcut } from "../../config/types";
import { useConfigStore } from "../../config/useConfig";
import { filterShortcuts } from "../../launcher/filter";
import { useShortcutImages } from "../../launcher/icons";
import { confirmationText, memberSummary, membersOf, needsConfirmation, newId, removeShortcut } from "../../launcher/model";
import { SHORTCUT_COLORS, ShortcutIcon } from "../../launcher/ShortcutIcon";
import { ipc } from "../../lib/ipc";
import { useSortable } from "../../settings/useSortable";
import { EmptyState } from "../EmptyState";
import { GripIcon, PencilIcon, SearchIcon } from "../icons";
import { GroupEditor } from "../../launcher/GroupEditor";
import { IconPicker } from "../../launcher/IconPicker";
import { QButton, QPath, QText } from "../quick/controls";
import { Suggestions } from "../quick/Suggestions";

const MAX_TILES = 6;

/** O que a página faz com um clique: confirma (apps, jogos e grupos), abre e conta o que deu errado. */
function useLauncher() {
  const shortcuts = useConfigStore((s) => s.config.shortcuts);
  const confirmApps = useConfigStore((s) => s.config.confirmApps);
  const [pending, setPending] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const images = useShortcutImages(shortcuts);

  const open = useCallback((index: number) => {
    setPending(null);
    setError(null);
    ipc.launch(index).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);
  const ask = useCallback(
    (index: number) => {
      if (needsConfirmation(shortcuts[index], shortcuts, confirmApps)) setPending(index);
      else open(index);
    },
    [shortcuts, confirmApps, open],
  );
  return { shortcuts, images, pending, setPending, error, open, ask };
}

/** O ícone de um atalho; grupos mostram quantos itens abrem. */
function Tile({ shortcut, index, image, shortcuts }: { shortcut: Shortcut; index: number; image?: string; shortcuts: Shortcut[] }) {
  const color = SHORTCUT_COLORS[index % SHORTCUT_COLORS.length];
  if (!shortcut.group) return <ShortcutIcon shortcut={shortcut} image={image} color={color} />;
  return (
    <span className="li-wrap">
      <ShortcutIcon shortcut={shortcut} image={image} color={color} />
      <i className="li-count">{membersOf(shortcut, shortcuts).length}</i>
    </span>
  );
}

function Confirm({ text, onCancel, onOk }: { text: string; onCancel: () => void; onOk: () => void }) {
  return (
    <div className="tile lc-confirm" role="alertdialog" aria-label={text}>
      <b>{text}</b>
      <div>
        <button className="nbtn" onClick={onCancel}>
          Cancelar
        </button>
        <button className="nbtn go" autoFocus onClick={onOk}>
          Abrir
        </button>
      </div>
    </div>
  );
}

export function LauncherPage() {
  const { shortcuts, images, pending, setPending, error, open, ask } = useLauncher();
  const [query, setQuery] = useState("");
  const all = useMemo(() => filterShortcuts(shortcuts, ""), [shortcuts]);
  const matches = useMemo(() => filterShortcuts(shortcuts, query), [shortcuts, query]);

  if (all.length === 0) {
    return (
      <EmptyState
        title="Cadastre seus atalhos"
        text="Apps, jogos, pastas e sites que você abre sempre. Crie pelo botão de expandir ou em Configurações."
        action={{ label: "Abrir configurações", onClick: () => ipc.openSettings("atalhos") }}
      />
    );
  }

  const more = matches.length - MAX_TILES;
  return (
    <div className="bento lc">
      <label className="tile nin">
        <span className="nin-ic">
          <SearchIcon />
        </span>
        <input
          value={query}
          placeholder={all.length > MAX_TILES ? `Buscar entre ${all.length} atalhos…` : "Buscar atalho…"}
          autoComplete="off"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && matches[0] && ask(matches[0].index)}
        />
        <kbd>Enter</kbd>
      </label>

      {pending !== null && shortcuts[pending] ? (
        <Confirm text={confirmationText(shortcuts[pending], shortcuts)} onCancel={() => setPending(null)} onOk={() => open(pending)} />
      ) : error ? (
        <div className="tile lc-empty">{error}</div>
      ) : matches.length === 0 ? (
        <div className="tile lc-empty">Nenhum atalho com esse nome.</div>
      ) : (
        <div className="lgrid">
          {matches.slice(0, MAX_TILES).map(({ item, index }, i) => (
            <button key={item.id || index} className="tile lt" title={item.group ? `Grupo: ${confirmationText(item, shortcuts)}` : item.target} onClick={() => ask(index)}>
              <Tile shortcut={item} index={index} image={images[index]} shortcuts={shortcuts} />
              <b>{item.name}</b>
              {i === 0 && query && <kbd>↵</kbd>}
            </button>
          ))}
          {more > 0 && <span className="lc-more">+{more} na tela expandida</span>}
        </div>
      )}
    </div>
  );
}

/** Uma linha do modo de edição: alça para arrastar, ícone, nome, destino (ou membros do grupo) e remover. */
function EditRow({
  shortcut,
  index,
  image,
  shortcuts,
  sortable,
  change,
  remove,
  pickIcon,
  editItems,
}: {
  shortcut: Shortcut;
  index: number;
  image?: string;
  shortcuts: Shortcut[];
  sortable: ReturnType<typeof useSortable>;
  change: (patch: Partial<Shortcut>) => void;
  remove: () => void;
  pickIcon: () => void;
  editItems: () => void;
}) {
  const [sure, setSure] = useState(false);
  const id = shortcut.id;
  return (
    <div className={`le-row${sortable.dragId === id ? " drag" : ""}`} ref={sortable.rowRef(id)} style={{ order: sortable.position.get(id) }}>
      <span className="handle" role="presentation" title="Arraste para mudar a ordem" onPointerDown={(e) => sortable.down(e, id)}>
        <GripIcon />
      </span>
      <button className="le-ico" title="Escolher o ícone" aria-label={`Escolher o ícone de ${shortcut.name || "atalho"}`} onClick={pickIcon}>
        <Tile shortcut={shortcut} index={index} image={image} shortcuts={shortcuts} />
      </button>
      <QText label="Nome do atalho" width={104} value={shortcut.name} placeholder={shortcut.group ? "Nome do grupo" : "Nome"} onCommit={(v) => change({ name: v })} />
      {shortcut.group ? (
        <>
          <span className="le-summary" title={memberSummary(shortcut, shortcuts, 99)}>
            {memberSummary(shortcut, shortcuts)}
          </span>
          <QButton onClick={editItems}>Itens…</QButton>
        </>
      ) : (
        <>
          <QPath label="Destino do atalho" kind="app" width={230} value={shortcut.target} placeholder="App, pasta ou https://…" onCommit={(v) => change({ target: v })} />
        </>
      )}
      {sure ? (
        <span className="le-sure">
          <QButton onClick={() => setSure(false)}>Não</QButton>
          <QButton tone="danger" onClick={remove}>
            Excluir
          </QButton>
        </span>
      ) : (
        <QButton tone="danger" onClick={() => setSure(true)} title="Excluir este atalho">
          ✕
        </QButton>
      )}
    </div>
  );
}

/** A tela maior dos atalhos: todos à vista e, em Editar, criar, reordenar, trocar ícone e montar grupos. */
export function LauncherLarge() {
  const { shortcuts, images, pending, setPending, error, open, ask } = useLauncher();
  const update = useConfigStore((s) => s.update);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(false);
  /** O atalho cujo ícone está sendo escolhido (o seletor ocupa o lugar da lista). */
  const [picking, setPicking] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  /** O grupo cujos itens estão sendo editados. */
  const [editingGroup, setEditingGroup] = useState<string | null>(null);
  const matches = useMemo(() => filterShortcuts(shortcuts, query), [shortcuts, query]);

  const set = (next: Shortcut[]) => update({ shortcuts: next });
  const sortable = useSortable(
    shortcuts.map((s) => s.id),
    (order) => set(order.flatMap((id) => shortcuts.filter((s) => s.id === id))),
  );
  const add = (group: boolean) => set([...shortcuts, { id: newId(), name: "", target: "", icon: "", group, members: [] }]);

  const pickingIndex = picking === null ? -1 : shortcuts.findIndex((s) => s.id === picking);
  if (pickingIndex >= 0) {
    const shortcut = shortcuts[pickingIndex];
    return (
      <div className="bento lcx">
        <IconPicker
          value={shortcut.icon ?? ""}
          name={shortcut.name}
          color={SHORTCUT_COLORS[pickingIndex % SHORTCUT_COLORS.length]}
          image={images[pickingIndex]}
          onChange={(icon) => set(shortcuts.map((s, i) => (i === pickingIndex ? { ...s, icon } : s)))}
          onDone={() => setPicking(null)}
        />
      </div>
    );
  }

  const groupToEdit = editingGroup === null ? undefined : shortcuts.find((s) => s.id === editingGroup && s.group);
  if (groupToEdit) {
    return (
      <div className="bento lcx">
        <GroupEditor group={groupToEdit} shortcuts={shortcuts} onChange={set} onDone={() => setEditingGroup(null)} />
      </div>
    );
  }

  if (suggesting) {
    return (
      <div className="bento lcx">
        <Suggestions onClose={() => setSuggesting(false)} />
      </div>
    );
  }

  return (
    <div className="bento lcx">
      <div className="lcx-top">
        {editing ? (
          <>
            <QButton tone="primary" disabled={shortcuts.length >= 40} onClick={() => add(false)}>
              + Atalho
            </QButton>
            <QButton disabled={shortcuts.length >= 40} onClick={() => add(true)}>
              + Grupo
            </QButton>
            <QButton onClick={() => setSuggesting(true)} title="Grupos prontos e apps que você mais usa">
              ✦ Sugestões
            </QButton>
            <span className="qs-note">Arraste pela alça para ordenar.</span>
          </>
        ) : (
          <label className="tile nin">
            <span className="nin-ic">
              <SearchIcon />
            </span>
            <input value={query} placeholder="Buscar atalho…" autoComplete="off" onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && matches[0] && ask(matches[0].index)} />
            <kbd>Enter</kbd>
          </label>
        )}
        <button className={`lcx-edit${editing ? " on" : ""}`} onClick={() => setEditing((v) => !v)} aria-pressed={editing}>
          <PencilIcon size={13} />
          {editing ? "Pronto" : "Editar"}
        </button>
      </div>

      {editing ? (
        <div className="tile lcx-list sortable">
          {shortcuts.length === 0 && <p className="qs-note">Nenhum atalho ainda. Use + Atalho para começar.</p>}
          {shortcuts.map((shortcut, index) => (
            <EditRow
              key={shortcut.id}
              shortcut={shortcut}
              index={index}
              image={images[index]}
              shortcuts={shortcuts}
              sortable={sortable}
              change={(patch) => set(shortcuts.map((s, i) => (i === index ? { ...s, ...patch } : s)))}
              remove={() => set(removeShortcut(shortcuts, index))}
              pickIcon={() => setPicking(shortcut.id)}
              editItems={() => setEditingGroup(shortcut.id)}
            />
          ))}
        </div>
      ) : pending !== null && shortcuts[pending] ? (
        <Confirm text={confirmationText(shortcuts[pending], shortcuts)} onCancel={() => setPending(null)} onOk={() => open(pending)} />
      ) : (
        <div className="lcx-grid">
          {error && <div className="tile lc-empty lcx-err">{error}</div>}
          {matches.length === 0 && !error && (
            <div className="tile lc-empty">{shortcuts.length === 0 ? "Nenhum atalho ainda. Toque em Editar para criar." : "Nenhum atalho com esse nome."}</div>
          )}
          {matches.map(({ item, index }) => (
            <button key={item.id || index} className="tile lt" title={item.group ? `Grupo: ${confirmationText(item, shortcuts)}` : item.target} onClick={() => ask(index)}>
              <Tile shortcut={item} index={index} image={images[index]} shortcuts={shortcuts} />
              <b>{item.name}</b>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
