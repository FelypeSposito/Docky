import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Shortcut, ShortcutSection } from "../../config/types";
import { useConfigStore } from "../../config/useConfig";
import { filterShortcuts } from "../../launcher/filter";
import { GroupEditor } from "../../launcher/GroupEditor";
import { IconPicker } from "../../launcher/IconPicker";
import { useShortcutImages } from "../../launcher/icons";
import { confirmationText, hideGrouped, hideableCount, memberSummary, membersOf, needsConfirmation, newId, removeShortcut, reorderSection, reorderVisible, setHidden, splitShortcuts } from "../../launcher/model";
import {
  type FilterChip,
  type IndexedShortcut,
  type SectionBlock,
  FILTER_ALL,
  FILTER_GROUPS,
  activeFilter,
  assignSection,
  autoOrganize,
  blockKey,
  filterChips,
  layoutSections,
  restTitle,
  sectionOf,
  toggleCollapsed,
} from "../../launcher/sections";
import { SHORTCUT_COLORS, ShortcutIcon } from "../../launcher/ShortcutIcon";
import { ipc } from "../../lib/ipc";
import { useSortable } from "../../settings/useSortable";
import { useGridSort } from "../useGridSort";
import { EmptyState } from "../EmptyState";
import { ArrowDownIcon, EyeIcon, EyeOffIcon, GripIcon, ListIcon, PencilIcon, SearchIcon, TrashIcon } from "../icons";
import { QButton, QIconButton, QPath, QText } from "../quick/controls";
import { Suggestions } from "../quick/Suggestions";
import { useIslandStore } from "../store";

const MAX_TILES = 8;

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

/** A busca dos atalhos, no cabeçalho da ilha aberta: qualquer tecla já começa a digitar aqui, e Enter abre o primeiro. */
export function LauncherSearch() {
  const shortcuts = useConfigStore((s) => s.config.shortcuts);
  const query = useIslandStore((s) => s.launcherQuery);
  const input = useRef<HTMLInputElement>(null);
  const total = useMemo(() => filterShortcuts(shortcuts, "").length, [shortcuts]);

  // Comece a digitar com a ilha aberta e a letra cai na busca, sem precisar clicar nela.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === " " && e.target instanceof Element && e.target.closest("button, [role=button]")) return;
      if (e.target instanceof Element && e.target.closest("input, textarea, select, [contenteditable]")) return;
      input.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <label className="hsearch">
      <SearchIcon />
      <input
        ref={input}
        value={query}
        placeholder={total > MAX_TILES ? `Buscar entre ${total} atalhos` : "Buscar atalho"}
        aria-label="Buscar atalho"
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => useIslandStore.getState().setLauncherQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") useIslandStore.getState().submitLauncher();
          // Esc com algo digitado só limpa a busca; vazio, deixa a ilha recolher como sempre.
          if (e.key === "Escape" && query) {
            e.stopPropagation();
            e.nativeEvent.stopImmediatePropagation();
            useIslandStore.getState().setLauncherQuery("");
          }
        }}
      />
      {query && <kbd>Enter</kbd>}
    </label>
  );
}

export function LauncherPage() {
  const { shortcuts, images, pending, setPending, error, open, ask } = useLauncher();
  const sections = useConfigStore((s) => s.config.shortcutSections);
  const query = useIslandStore((s) => s.launcherQuery);
  const enter = useIslandStore((s) => s.launcherEnter);
  const all = useMemo(() => filterShortcuts(shortcuts, ""), [shortcuts]);
  const matches = useMemo(() => groupsFirst(filterShortcuts(shortcuts, query)), [shortcuts, query]);
  const searching = query.trim() !== "";

  // Enter na busca do cabeçalho abre o primeiro da lista (com a confirmação, quando ela vale).
  const lastEnter = useRef(enter);
  useEffect(() => {
    if (enter === lastEnter.current) return;
    lastEnter.current = enter;
    if (matches[0]) ask(matches[0].index);
  }, [enter, matches, ask]);

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
  const sectionNames = sections.filter((section) => section.members.length > 0).map((section) => section.name).slice(0, 3);

  if (pending !== null && shortcuts[pending]) {
    return <Confirm text={confirmationText(shortcuts[pending], shortcuts)} onCancel={() => setPending(null)} onOk={() => open(pending)} />;
  }
  if (error) return <div className="tile lc-empty">{error}</div>;
  if (matches.length === 0) {
    return (
      <div className="lc-none">
        <b>Nenhum atalho com “{query.trim()}”</b>
        <span>Confira o nome ou crie um novo.</span>
        <button className="lc-more2" onClick={() => useIslandStore.getState().toggleLarge()}>
          Criar na tela expandida
        </button>
      </div>
    );
  }

  return (
    <div className="lc2">
      <div className="lgrid4">
        {matches.slice(0, MAX_TILES).map(({ item, index }, i) => (
          <button
            key={item.id || index}
            className={`lt2${i === 0 ? (searching ? " first match" : " first") : ""}`}
            title={item.group ? `Grupo: ${confirmationText(item, shortcuts)}` : item.target}
            onClick={() => ask(index)}
          >
            <Tile shortcut={item} index={index} image={images[index]} shortcuts={shortcuts} />
            <b>{item.name || "Sem nome"}</b>
          </button>
        ))}
      </div>
      {more > 0 && (
        <button className="lc-more2" onClick={() => useIslandStore.getState().toggleLarge()} title="Ver todos os atalhos na tela expandida">
          {searching ? `+${more} ${more === 1 ? "resultado" : "resultados"}` : `+${more} atalhos`}
          {!searching && sectionNames.length > 0 && <span> · {sectionNames.join(", ")}</span>}
        </button>
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
  autoFocus,
  sections,
  sectionId,
  onSection,
}: {
  autoFocus?: boolean;
  /** As seções para escolher (atalhos comuns); grupos não ficam em seção. */
  sections?: ShortcutSection[];
  sectionId?: string | null;
  onSection?: (sectionId: string | null) => void;
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
    <div
      className={`le-row${sortable.dragId === id ? " drag" : ""}${shortcut.hidden ? " is-hidden" : ""}`}
      data-sid={id}
      ref={sortable.rowRef(id)}
      style={{ order: sortable.position.get(id) }}
    >
      <span className="handle" role="presentation" title="Arraste para mudar a ordem" onPointerDown={(e) => sortable.down(e, id)}>
        <GripIcon />
      </span>
      <button className="le-ico" title="Escolher o ícone" aria-label={`Escolher o ícone de ${shortcut.name || "atalho"}`} onClick={pickIcon}>
        <Tile shortcut={shortcut} index={index} image={image} shortcuts={shortcuts} />
      </button>
      <QText
        label="Nome do atalho"
        width={shortcut.group ? 150 : 124}
        value={shortcut.name}
        placeholder={shortcut.group ? "Nome do grupo" : "Nome"}
        autoFocus={autoFocus}
        onCommit={(v) => change({ name: v })}
      />
      {shortcut.group ? (
        <span className="le-summary" title={memberSummary(shortcut, shortcuts, 99)}>
          {memberSummary(shortcut, shortcuts)}
        </span>
      ) : (
        <QPath label="Destino do atalho" kind="app" width={sections && sections.length > 0 ? 150 : 210} value={shortcut.target} placeholder="App, pasta ou https://…" onCommit={(v) => change({ target: v })} />
      )}
      {sections && sections.length > 0 && onSection && (
        <select className="le-secsel" aria-label={`Seção de ${shortcut.name || "atalho"}`} value={sectionId ?? ""} onChange={(e) => onSection(e.target.value || null)}>
          <option value="">Sem seção</option>
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
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

/** Um sim/não lembrado só neste computador (a parte "Outros" e a dos grupos, que não são seções da configuração). */
function useLocalFlag(key: string, initial: boolean): [boolean, () => void] {
  const [value, setValue] = useState(() => {
    try {
      const saved = localStorage.getItem(key);
      return saved === null ? initial : saved === "1";
    } catch {
      return initial;
    }
  });
  const toggle = () =>
    setValue((current) => {
      try {
        localStorage.setItem(key, current ? "0" : "1");
      } catch {
        // sem armazenamento, só não lembra
      }
      return !current;
    });
  return [value, toggle];
}

type RenderTile = (entry: IndexedShortcut, sorter: ReturnType<typeof useGridSort>) => React.ReactNode;

/**
 * Uma seção da tela grande dos atalhos. O título (com a setinha) abre e fecha a parte; dentro, os ícones se
 * reordenam arrastando, só entre eles. Recolhida, a grade some com o conteúdo inerte (fora do Tab e do leitor de tela).
 */
function SectionView({
  id,
  title,
  collapsed,
  onToggle,
  entries,
  onReorder,
  canDrag,
  renderTile,
  fixed = false,
}: {
  id: string;
  title: string;
  collapsed: boolean;
  onToggle: () => void;
  entries: IndexedShortcut[];
  onReorder: (order: string[]) => void;
  canDrag: boolean;
  renderTile: RenderTile;
  /** Aberta pelo filtro: o título vira só um rótulo (quem manda é o filtro) e o recolher guardado fica intacto. */
  fixed?: boolean;
}) {
  const sorter = useGridSort(
    entries.map((e) => e.item.id),
    onReorder,
    canDrag && !collapsed,
  );
  return (
    <section className={`lsec${collapsed ? " closed" : ""}`} aria-labelledby={`lsec-${id}`}>
      {fixed ? (
        <h3 id={`lsec-${id}`} className="lsec-head fixed">
          <span>{title}</span>
          <i>{entries.length}</i>
        </h3>
      ) : (
        <button id={`lsec-${id}`} className="lsec-head" aria-expanded={!collapsed} onClick={onToggle}>
          <ArrowDownIcon size={12} />
          <span>{title}</span>
          <i>{entries.length}</i>
        </button>
      )}
      <div className="lsec-body" inert={collapsed}>
        <div className="lsec-clip">
          <div className="lsec-grid">{entries.map((entry) => renderTile(entry, sorter))}</div>
        </div>
      </div>
    </section>
  );
}

/**
 * A fileira de filtros acima da lista: "Tudo" e um botão por parte, para chegar a uma seção sem rolar. Não quebra
 * linha: rola de lado (sem barra), e o filtro escolhido é trazido para a vista. As setas andam entre os botões
 * (só o escolhido entra no Tab) e já escolhem.
 */
function FilterRow({ chips, active, onSelect }: { chips: FilterChip[]; active: string; onSelect: (key: string) => void }) {
  const rowRef = useRef<HTMLDivElement>(null);
  const activeIndex = Math.max(0, chips.findIndex((c) => c.key === active));
  useEffect(() => {
    const row = rowRef.current;
    const el = row?.children[activeIndex] as HTMLElement | undefined;
    if (!row || !el) return;
    // Só a fileira rola (`scrollIntoView` mexeria também na lista e na janela da ilha).
    const box = el.getBoundingClientRect();
    const view = row.getBoundingClientRect();
    if (box.left < view.left + 4 || box.right > view.right - 4) {
      const left = box.left - view.left + row.scrollLeft - (row.clientWidth - box.width) / 2;
      row.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
    }
  }, [activeIndex, chips.length]);
  const onKeyDown = (e: React.KeyboardEvent) => {
    const last = chips.length - 1;
    const next = e.key === "ArrowRight" ? Math.min(last, activeIndex + 1) : e.key === "ArrowLeft" ? Math.max(0, activeIndex - 1) : e.key === "Home" ? 0 : e.key === "End" ? last : -1;
    if (next < 0) return;
    e.preventDefault();
    onSelect(chips[next].key);
    (rowRef.current?.children[next] as HTMLElement | undefined)?.focus({ preventScroll: true });
  };
  return (
    <div className="lcx-chips" role="toolbar" aria-label="Ir para a seção" ref={rowRef} onKeyDown={onKeyDown}>
      {chips.map((chip, i) => (
        <button key={chip.key} className="lcx-chip" aria-pressed={i === activeIndex} tabIndex={i === activeIndex ? 0 : -1} onClick={() => onSelect(chip.key)}>
          <span>{chip.label}</span>
          <i>{chip.count}</i>
        </button>
      ))}
    </div>
  );
}

/** O resultado de uma busca: tudo numa grade só, sem seções (o que você procura pode estar numa parte recolhida). */
function SearchResults({ entries, renderTile }: { entries: IndexedShortcut[]; renderTile: RenderTile }) {
  const sorter = useGridSort(
    entries.map((e) => e.item.id),
    () => {},
    false,
  );
  return <div className="lsec-grid">{entries.map((entry) => renderTile(entry, sorter))}</div>;
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
  /** Os grupos ficam numa parte que abre e fecha, abaixo dos atalhos e fechada de início: o foco são os atalhos. */
  const [groupsOpen, setGroupsOpen] = useState(false);
  /** O atalho recém-criado: entra no fim da lista (a ordem dos outros não muda), a lista rola até ele e o nome ganha o foco. */
  const [fresh, setFresh] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const addItem = () => {
    const id = newId();
    set([...shortcuts, { id, name: "", target: "", icon: "", group: false, members: [] }]);
    setFresh(id);
  };
  useEffect(() => {
    const list = listRef.current;
    if (fresh === null || !list) return;
    const el = Array.from(list.querySelectorAll<HTMLElement>("[data-sid]")).find((row) => row.dataset.sid === fresh);
    if (!el) return; // a linha ainda não apareceu: tenta de novo quando a lista mudar
    // Só a lista rola (`scrollIntoView` mexeria também na janela da ilha).
    const box = el.getBoundingClientRect();
    const view = list.getBoundingClientRect();
    if (box.top < view.top + 8 || box.bottom > view.bottom - 8) {
      const top = box.top - view.top + list.scrollTop - (list.clientHeight - box.height) / 2;
      list.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    }
    setFresh(null); // o foco já foi dado na montagem; a linha não pede foco de novo ao voltar de um painel
  }, [fresh, shortcuts]);
  /** Um grupo novo já abre o painel de itens, para dar nome e escolher o que ele abre. */
  const addGroup = () => {
    const group: Shortcut = { id: newId(), name: "", target: "", icon: "lib:briefcase", group: true, members: [] };
    set([group, ...shortcuts]);
    setEditingGroup(group.id);
    setGroupsOpen(true);
  };
  const hideable = hideableCount(shortcuts);
  // Seções (Jogos, Comunicação…): cada uma abre e fecha pelo título. As da pessoa guardam isso na configuração;
  // "Outros" (os sem seção) e "Grupos" lembram só neste computador. Os grupos começam fechados: o foco são os atalhos.
  // Hooks ficam antes dos `return` dos painéis abaixo: trocar de painel não pode mudar a quantidade deles.
  const sections = useConfigStore((s) => s.config.shortcutSections);
  const setSections = (next: ShortcutSection[]) => update({ shortcutSections: next });
  const [restClosed, toggleRest] = useLocalFlag("docky-launcher-rest-closed", false);
  const [groupsClosed, toggleGroups] = useLocalFlag("docky-launcher-groups-closed", true);
  const searching = query.trim() !== "";
  // Filtros (Tudo, cada seção, Outros, Grupos): mostram só uma parte, aberta, sem mexer no recolher guardado. O
  // escolhido fica só aqui (volta a "Tudo" quando a página remonta) e cai para "Tudo" se a parte sumir.
  const [filter, setFilter] = useState<string>(FILTER_ALL);
  const scrollRef = useRef<HTMLDivElement>(null);
  const blocks = layoutSections(shownItems, sections);
  const chips = filterChips(blocks, shownGroups.length, sections);
  const current = activeFilter(chips, filter);
  const selectFilter = (key: string) => {
    setFilter(key);
    scrollRef.current?.scrollTo({ top: 0 }); // a parte escolhida começa do topo
  };

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
      autoFocus={entry.item.id === fresh}
      change={(patch) => set(shortcuts.map((s, i) => (i === entry.index ? { ...s, ...patch } : s)))}
      remove={() => set(removeShortcut(shortcuts, entry.index))}
      pickIcon={() => setPicking(entry.item.id)}
      editItems={() => setEditingGroup(entry.item.id)}
      toggleHidden={() => set(setHidden(shortcuts, entry.item.id, !entry.item.hidden))}
      sections={entry.item.group ? undefined : sections}
      sectionId={sectionOf(entry.item.id, sections)?.id ?? null}
      onSection={(sectionId) => setSections(assignSection(sections, entry.item.id, sectionId))}
    />
  );

  const tile: RenderTile = ({ item, index }, sorter) => (
    <button
      key={item.id || index}
      ref={sorter.tileRef(item.id)}
      className={`tile lt${sorter.dragId === item.id ? " drag" : ""}`}
      style={{ order: sorter.position.get(item.id) }}
      title={item.group ? `Grupo: ${confirmationText(item, shortcuts)}` : item.target}
      onClick={() => ask(index)}
      onPointerDown={(e) => sorter.down(e, item.id)}
      onDragStart={(e) => e.preventDefault()}
    >
      <Tile shortcut={item} index={index} image={images[index]} shortcuts={shortcuts} />
      <b>{item.name}</b>
    </button>
  );
  const reorderItems = (order: string[]) => set(reorderVisible(shortcuts, false, order));
  /** Com um filtro, só a parte dele aparece, aberta (`fixed`); em "Tudo", todas, cada uma como foi deixada. */
  const filtered = !searching && current !== FILTER_ALL;
  const shownBlocks = filtered ? blocks.filter((b) => blockKey(b) === current) : blocks;
  const showGroups = shownGroups.length > 0 && (!filtered || current === FILTER_GROUPS);
  const blockView = ({ section, entries }: SectionBlock) =>
    section ? (
      <SectionView
        key={section.id}
        id={section.id}
        title={section.name}
        collapsed={!filtered && section.collapsed}
        fixed={filtered}
        onToggle={() => setSections(toggleCollapsed(sections, section.id))}
        entries={entries}
        onReorder={reorderItems}
        canDrag
        renderTile={tile}
      />
    ) : (
      <SectionView
        key="rest"
        id="rest"
        title={restTitle(sections)}
        collapsed={!filtered && restClosed}
        fixed={filtered}
        onToggle={toggleRest}
        entries={entries}
        onReorder={reorderItems}
        canDrag
        renderTile={tile}
      />
    );
  /** Põe os atalhos sem seção nas seções prontas que fazem sentido (Jogos, Comunicação, Utilitários…). */
  const organize = () => setSections(autoOrganize(shortcuts, sections, newId));
  const unsorted = shortcuts.filter((s) => !s.group && !s.hidden && !sectionOf(s.id, sections)).length;

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
        <div className="tile lcx-list" ref={listRef}>
          <div className="lcx-sec">
            <h3>Atalhos</h3>
            {unsorted > 0 && (
              <QButton onClick={organize} title="Separa os atalhos em seções prontas (Jogos, Comunicação, Utilitários…). Dá para mudar a seção de cada um aqui.">
                Organizar em seções
              </QButton>
            )}
            {hideable > 0 && (
              <QButton onClick={() => set(hideGrouped(shortcuts))} title="Esconde da lista os atalhos que já estão em algum grupo">
                Ocultar os de grupos ({hideable})
              </QButton>
            )}
            <QButton tone="primary" disabled={shortcuts.length >= 60} onClick={addItem}>
              + Atalho
            </QButton>
          </div>
          <div className="sc sortable">
            {plain.length === 0 && <p className="qs-note">Nenhum atalho ainda.</p>}
            {plain.map((entry) => row(entry, sortItems))}
          </div>
          {plain.length > 0 && (
            <button className="lcx-add" disabled={shortcuts.length >= 60} onClick={addItem}>
              + Atalho
            </button>
          )}

          <div className="lcx-sec">
            <h3>
              <button className="lcx-disc" aria-expanded={groupsOpen} onClick={() => setGroupsOpen((v) => !v)}>
                Grupos ({groups.length})
                <ArrowDownIcon size={11} />
              </button>
            </h3>
            {groupsOpen && (
              <QButton disabled={shortcuts.length >= 60} onClick={addGroup}>
                + Grupo
              </QButton>
            )}
          </div>
          {groupsOpen && (
            <div className="sc sortable">
              {groups.length === 0 && <p className="qs-note">Nenhum grupo ainda. Um grupo abre vários atalhos de uma vez.</p>}
              {groups.map((entry) => row(entry, sortGroups))}
            </div>
          )}
        </div>
      ) : pending !== null && shortcuts[pending] ? (
        <Confirm text={confirmationText(shortcuts[pending], shortcuts)} onCancel={() => setPending(null)} onOk={() => open(pending)} />
      ) : (
        <>
          {!searching && chips.length > 0 && <FilterRow chips={chips} active={current} onSelect={selectFilter} />}
          <div className="lcx-scroll" ref={scrollRef}>
            {error && <div className="tile lc-empty lcx-err">{error}</div>}
            {matches.length === 0 && !error && (
              <div className="tile lc-empty">{shortcuts.length === 0 ? "Nenhum atalho ainda. Toque em Editar para criar." : "Nenhum atalho com esse nome."}</div>
            )}
            {searching ? (
              <SearchResults entries={[...shownItems, ...shownGroups]} renderTile={tile} />
            ) : (
              <>
                {shownBlocks.map(blockView)}
                {showGroups && (
                  <SectionView
                    key="groups"
                    id="groups"
                    title="Grupos"
                    collapsed={!filtered && groupsClosed}
                    fixed={filtered}
                    onToggle={toggleGroups}
                    entries={shownGroups}
                    onReorder={(order) => set(reorderVisible(shortcuts, true, order))}
                    canDrag
                    renderTile={tile}
                  />
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
