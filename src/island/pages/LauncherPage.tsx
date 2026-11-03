import { useCallback, useMemo, useState } from "react";
import type { Shortcut } from "../../config/types";
import { useConfigStore } from "../../config/useConfig";
import { filterShortcuts } from "../../launcher/filter";
import { GroupEditor } from "../../launcher/GroupEditor";
import { IconPicker } from "../../launcher/IconPicker";
import { useShortcutImages } from "../../launcher/icons";
import { confirmationText, hideGrouped, hideableCount, memberSummary, membersOf, needsConfirmation, newId, removeShortcut, reorderSection, reorderVisible, setHidden, splitShortcuts } from "../../launcher/model";
import { SHORTCUT_COLORS, ShortcutIcon } from "../../launcher/ShortcutIcon";
import { ipc } from "../../lib/ipc";
import { useSortable } from "../../settings/useSortable";
import { useGridSort } from "../useGridSort";
import { EmptyState } from "../EmptyState";
import { EyeIcon, EyeOffIcon, GripIcon, ListIcon, PencilIcon, SearchIcon, TrashIcon } from "../icons";
import { QButton, QIconButton, QPath, QText } from "../quick/controls";
import { Suggestions } from "../quick/Suggestions";
import { useIslandStore } from "../store";

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

/** Os grupos antes dos atalhos comuns, cada parte na ordem em que está. */
const groupsFirst = <T extends { item: Shortcut }>(list: T[]): T[] => [...list.filter((e) => e.item.group), ...list.filter((e) => !e.item.group)];

export function LauncherPage() {
  const { shortcuts, images, pending, setPending, error, open, ask } = useLauncher();
  const [query, setQuery] = useState("");
  const all = useMemo(() => filterShortcuts(shortcuts, ""), [shortcuts]);
  const matches = useMemo(() => groupsFirst(filterShortcuts(shortcuts, query)), [shortcuts, query]);

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
          {more > 0 && (
            <button className="lc-more" onClick={() => useIslandStore.getState().toggleLarge()} title="Ver todos os atalhos">
              +{more} na tela expandida ↗
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Uma linha do modo de edição: alça, ícone, nome, destino (ou itens do grupo) e ações só de ícone. */
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
  toggleHidden,
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
  toggleHidden: () => void;
}) {
  const [sure, setSure] = useState(false);
  const id = shortcut.id;
  return (
    <div className={`le-row${sortable.dragId === id ? " drag" : ""}${shortcut.hidden ? " is-hidden" : ""}`} ref={sortable.rowRef(id)} style={{ order: sortable.position.get(id) }}>
      <span className="handle" role="presentation" title="Arraste para mudar a ordem" onPointerDown={(e) => sortable.down(e, id)}>
        <GripIcon />
      </span>
      <button className="le-ico" title="Escolher o ícone" aria-label={`Escolher o ícone de ${shortcut.name || "atalho"}`} onClick={pickIcon}>
        <Tile shortcut={shortcut} index={index} image={image} shortcuts={shortcuts} />
      </button>
      <QText label="Nome do atalho" width={shortcut.group ? 150 : 124} value={shortcut.name} placeholder={shortcut.group ? "Nome do grupo" : "Nome"} onCommit={(v) => change({ name: v })} />
      {shortcut.group ? (
        <span className="le-summary" title={memberSummary(shortcut, shortcuts, 99)}>
          {memberSummary(shortcut, shortcuts)}
        </span>
      ) : (
        <QPath label="Destino do atalho" kind="app" width={210} value={shortcut.target} placeholder="App, pasta ou https://…" onCommit={(v) => change({ target: v })} />
      )}
      {shortcut.group && (
        <QIconButton label="Itens do grupo" onClick={editItems}>
          <ListIcon />
        </QIconButton>
      )}
      <QIconButton label={shortcut.hidden ? "Mostrar na lista" : "Ocultar da lista (continua funcionando nos grupos)"} active={!!shortcut.hidden} onClick={toggleHidden}>
        {shortcut.hidden ? <EyeOffIcon /> : <EyeIcon />}
      </QIconButton>
      {sure ? (
        <span className="le-sure">
          <QButton onClick={() => setSure(false)}>Não</QButton>
          <QButton tone="danger" onClick={remove}>
            Excluir
          </QButton>
        </span>
      ) : (
        <QIconButton label="Excluir" tone="danger" onClick={() => setSure(true)}>
          <TrashIcon />
        </QIconButton>
      )}
    </div>
  );
}

/** A tela maior dos atalhos: grupos e atalhos em partes separadas e, em Editar, criar, ordenar, ocultar e montar grupos. */
export function LauncherLarge() {
  const { shortcuts, images, pending, setPending, error, open, ask } = useLauncher();
  const update = useConfigStore((s) => s.update);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(false);
  /** O atalho cujo ícone está sendo escolhido (o seletor ocupa o lugar da lista). */
  const [picking, setPicking] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  /** O grupo cujo nome e itens estão sendo editados. */
  const [editingGroup, setEditingGroup] = useState<string | null>(null);
  const matches = useMemo(() => filterShortcuts(shortcuts, query), [shortcuts, query]);
  const shownGroups = matches.filter((e) => e.item.group);
  const shownItems = matches.filter((e) => !e.item.group);
  const { groups, items: plain } = splitShortcuts(shortcuts);

  const set = (next: Shortcut[]) => update({ shortcuts: next });
  const sortGroups = useSortable(
    groups.map((e) => e.item.id),
    (order) => set(reorderSection(shortcuts, true, order)),
  );
  const sortItems = useSortable(
    plain.map((e) => e.item.id),
    (order) => set(reorderSection(shortcuts, false, order)),
  );
  const addItem = () => set([...shortcuts, { id: newId(), name: "", target: "", icon: "", group: false, members: [] }]);
  /** Um grupo novo já abre o painel de itens, para dar nome e escolher o que ele abre. */
  const addGroup = () => {
    const group: Shortcut = { id: newId(), name: "", target: "", icon: "lib:briefcase", group: true, members: [] };
    set([group, ...shortcuts]);
    setEditingGroup(group.id);
  };
  const hideable = hideableCount(shortcuts);

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

  const row = (entry: { item: Shortcut; index: number }, sortable: ReturnType<typeof useSortable>) => (
    <EditRow
      key={entry.item.id}
      shortcut={entry.item}
      index={entry.index}
      image={images[entry.index]}
      shortcuts={shortcuts}
      sortable={sortable}
      change={(patch) => set(shortcuts.map((s, i) => (i === entry.index ? { ...s, ...patch } : s)))}
      remove={() => set(removeShortcut(shortcuts, entry.index))}
      pickIcon={() => setPicking(entry.item.id)}
      editItems={() => setEditingGroup(entry.item.id)}
      toggleHidden={() => set(setHidden(shortcuts, entry.item.id, !entry.item.hidden))}
    />
  );

  /** Os ícones se reordenam arrastando (só com a lista inteira à mostra, sem busca); cada parte sozinha. */
  const canDrag = query.trim() === "";
  const dragGroups = useGridSort(
    shownGroups.map((e) => e.item.id),
    (order) => set(reorderVisible(shortcuts, true, order)),
    canDrag,
  );
  const dragItems = useGridSort(
    shownItems.map((e) => e.item.id),
    (order) => set(reorderVisible(shortcuts, false, order)),
    canDrag,
  );
  /** O `order` do CSS põe o título e os ícones de cada parte no lugar (os grupos antes dos atalhos). */
  const ITEMS_BASE = 1000;

  const tile = ({ item, index }: { item: Shortcut; index: number }) => {
    const sorter = item.group ? dragGroups : dragItems;
    return (
      <button
        key={item.id || index}
        ref={sorter.tileRef(item.id)}
        className={`tile lt${sorter.dragId === item.id ? " drag" : ""}`}
        style={{ order: (item.group ? 1 : ITEMS_BASE + 1) + (sorter.position.get(item.id) ?? 0) }}
        title={item.group ? `Grupo: ${confirmationText(item, shortcuts)}` : item.target}
        onClick={() => ask(index)}
        onPointerDown={(e) => sorter.down(e, item.id)}
        onDragStart={(e) => e.preventDefault()}
      >
        <Tile shortcut={item} index={index} image={images[index]} shortcuts={shortcuts} />
        <b>{item.name}</b>
      </button>
    );
  };

  return (
    <div className="bento lcx">
      <div className="lcx-top">
        {editing ? (
          <>
            <QButton onClick={() => setSuggesting(true)} title="Grupos prontos e apps que você mais usa">
              ✦ Sugestões
            </QButton>
            <span className="qs-note">Arraste pela alça para ordenar. O olho oculta o atalho da lista, e ele continua nos grupos.</span>
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
        <div className="tile lcx-list">
          <div className="lcx-sec">
            <h3>Grupos</h3>
            <QButton tone="primary" disabled={shortcuts.length >= 60} onClick={addGroup}>
              + Grupo
            </QButton>
          </div>
          <div className="sc sortable">
            {groups.length === 0 && <p className="qs-note">Nenhum grupo ainda. Um grupo abre vários atalhos de uma vez.</p>}
            {groups.map((entry) => row(entry, sortGroups))}
          </div>

          <div className="lcx-sec">
            <h3>Atalhos</h3>
            {hideable > 0 && (
              <QButton onClick={() => set(hideGrouped(shortcuts))} title="Esconde da lista os atalhos que já estão em algum grupo">
                Ocultar os de grupos ({hideable})
              </QButton>
            )}
            <QButton disabled={shortcuts.length >= 60} onClick={addItem}>
              + Atalho
            </QButton>
          </div>
          <div className="sc sortable">
            {plain.length === 0 && <p className="qs-note">Nenhum atalho ainda.</p>}
            {plain.map((entry) => row(entry, sortItems))}
          </div>
        </div>
      ) : pending !== null && shortcuts[pending] ? (
        <Confirm text={confirmationText(shortcuts[pending], shortcuts)} onCancel={() => setPending(null)} onOk={() => open(pending)} />
      ) : (
        <div className="lcx-grid">
          {error && <div className="tile lc-empty lcx-err">{error}</div>}
          {matches.length === 0 && !error && (
            <div className="tile lc-empty">{shortcuts.length === 0 ? "Nenhum atalho ainda. Toque em Editar para criar." : "Nenhum atalho com esse nome."}</div>
          )}
          {shownGroups.length > 0 && (
            <h3 className="lcx-h" style={{ order: 0 }}>
              Grupos
            </h3>
          )}
          {shownGroups.map(tile)}
          {shownItems.length > 0 && (
            <h3 className="lcx-h" style={{ order: ITEMS_BASE }}>
              Atalhos
            </h3>
          )}
          {shownItems.map(tile)}
        </div>
      )}
    </div>
  );
}
