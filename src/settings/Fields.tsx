import { useEffect, useState } from "react";
import { useConfigStore } from "../config/useConfig";
import type { ShelfFolder, Shortcut } from "../config/types";
import type { MonitorInfo } from "../lib/ipc";
import { ArrowDownIcon, ArrowUpIcon, GripIcon } from "../island/icons";
import { moveItem, orderPages } from "../island/pageOrder";
import { PAGES } from "../island/pages/registry";
import { iconKind, useShortcutImages } from "../launcher/icons";
import { SHORTCUT_COLORS, ShortcutIcon } from "../launcher/ShortcutIcon";
import { cleanTarget, newId, removeShortcut, toggleMember } from "../launcher/model";
import { ipc } from "../lib/ipc";
import { Group, Row, Segmented, Toggle } from "./controls";
import { useSortable } from "./useSortable";

interface TextFieldProps {
  value: string;
  placeholder?: string;
  label: string;
  width?: number;
  type?: string;
  onCommit: (value: string) => void;
}

/** Campo de texto que só grava ao sair dele ou apertar Enter, para não salvar a cada tecla. */
export function TextField({ value, placeholder, label, width = 240, type = "text", onCommit }: TextFieldProps) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => draft !== value && onCommit(draft.trim());
  return (
    <input
      className="inp"
      style={{ width }}
      type={type}
      value={draft}
      placeholder={placeholder}
      aria-label={label}
      spellCheck={false}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
    />
  );
}

export function NotesFolderRow() {
  const { config, update } = useConfigStore();
  return (
    <Row label="Pasta das notas" hint="As notas rápidas viram arquivos .md nesta pasta (por exemplo, a Inbox do Obsidian)">
      <TextField
        label="Pasta das notas"
        width={300}
        value={config.notesFolder}
        placeholder="C:\Users\você\Documentos\brain\Inbox"
        onCommit={(v) => update({ notesFolder: v })}
      />
    </Row>
  );
}

export function WeatherCityRow() {
  const { config, update } = useConfigStore();
  return (
    <Row label="Cidade do clima" hint="Open-Meteo, gratuito e sem chave">
      <TextField label="Cidade do clima" value={config.weatherCity} placeholder="Digite a cidade" onCommit={(v) => update({ weatherCity: v })} />
    </Row>
  );
}

export function ShelfFolders() {
  const { config, update } = useConfigStore();
  const moveMode = (
    <Group>
      <Row label="Ao enviar" hint={config.shelfMove ? "O arquivo vai para o destino e é apagado de onde estava" : "O arquivo é copiado e o original continua onde estava"}>
        <Segmented
          label="Ao enviar"
          value={config.shelfMove ? "move" : "copy"}
          options={[
            { value: "copy", label: "Copiar" },
            { value: "move", label: "Mover" },
          ]}
          onChange={(v) => update({ shelfMove: v === "move" })}
        />
      </Row>
    </Group>
  );
  const folders = config.shelfFolders;
  const set = (next: ShelfFolder[]) => update({ shelfFolders: next });
  const change = (index: number, patch: Partial<ShelfFolder>) => set(folders.map((f, i) => (i === index ? { ...f, ...patch } : f)));

  return (
    <>
      <Group>
        {folders.length === 0 && <Row label="Nenhuma pasta ainda" hint="Adicione as pastas para onde os arquivos soltos na ilha serão copiados" />}
        {folders.map((folder, i) => (
          <div className="row folder-row" key={i}>
            <TextField label="Nome da pasta" width={110} value={folder.name} placeholder="Nome" onCommit={(v) => change(i, { name: v })} />
            <TextField label="Caminho da pasta" width={230} value={folder.path} placeholder="C:\Users\você\Google Drive\Faculdade" onCommit={(v) => change(i, { path: v })} />
            <button
              className="btn"
              title="Escolher a pasta no computador"
              onClick={() => void ipc.pickPath("folder").then((path) => path && change(i, { path, name: folder.name || path.split(/[\\/]/).filter(Boolean).pop() || "" }))}
            >
              Escolher…
            </button>
            <button className="btn danger" onClick={() => set(folders.filter((_, k) => k !== i))}>
              Remover
            </button>
          </div>
        ))}
        <Row label="Adicionar pasta" hint="Os arquivos são copiados; os originais ficam onde estão. A pasta precisa existir">
          <button className="btn primary" disabled={folders.length >= 4} onClick={() => set([...folders, { name: "", path: "" }])}>
            Adicionar
          </button>
        </Row>
      </Group>
      {moveMode}
      {folders.some((f) => !f.name.trim() || !f.path.trim()) && (
        <p className="hint">Preencha o nome e o caminho; pastas incompletas não aparecem na ilha.</p>
      )}
    </>
  );
}

const HOTKEYS: [string, string[]][] = [
  ["Abrir e fechar a ilha", ["Ctrl", "Alt", "D"]],
  ["Próxima página", ["Ctrl", "Alt", "→"]],
  ["Página anterior", ["Ctrl", "Alt", "←"]],
  ["Nota rápida", ["Ctrl", "Alt", "N"]],
];

export function ShortcutsEditor() {
  const { config, update } = useConfigStore();
  const items = config.shortcuts;
  const set = (next: Shortcut[]) => update({ shortcuts: next });
  const change = (index: number, patch: Partial<Shortcut>) => set(items.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  // Cada linha é identificada pelo id do atalho; ao soltar, a lista é remontada na nova ordem.
  const sortable = useSortable(
    items.map((s) => s.id),
    (order) => set(order.flatMap((id) => items.filter((s) => s.id === id))),
  );
  const images = useShortcutImages(items);
  const pickImage = (index: number) => void ipc.pickPath("image").then((path) => path && change(index, { icon: path }));
  const pickApp = (index: number) => void ipc.pickPath("app").then((path) => path && change(index, { target: path }));
  const add = (group: boolean) => set([...items, { name: "", target: "", icon: "", id: newId(), group, members: [] }]);

  return (
    <>
      <Group>
        {items.length === 0 && <Row label="Nenhum atalho ainda" hint="Apps, jogos, pastas, arquivos e sites que você abre sempre" />}
        <div className="sortable">
          {items.map((item, i) => (
            <div
              className={`row folder-row srow${sortable.dragId === item.id ? " drag" : ""}`}
              key={item.id}
              ref={sortable.rowRef(item.id)}
              style={{ order: sortable.position.get(item.id) }}
            >
              <span className="handle" role="presentation" title="Arraste para mudar a ordem" onPointerDown={(e) => sortable.down(e, item.id)}>
                <GripIcon />
              </span>
              <button
                className="sico"
                aria-label={`Escolher a imagem do ícone de ${item.name || "atalho"}`}
                title="Escolher uma imagem para o ícone"
                onClick={() => pickImage(i)}
              >
                <ShortcutIcon shortcut={item} image={images[i]} color={SHORTCUT_COLORS[i % SHORTCUT_COLORS.length]} className="li" />
              </button>
              <TextField label="Nome do atalho" width={100} value={item.name} placeholder={item.group ? "Nome do grupo" : "Nome"} onCommit={(v) => change(i, { name: v })} />
              {item.group ? (
                <div className="members" role="group" aria-label={`Itens de ${item.name || "grupo"}`}>
                  {items.filter((s) => !s.group && s.id !== item.id).length === 0 && <span className="hint-inline">Crie atalhos para colocar no grupo.</span>}
                  {items
                    .filter((s) => !s.group && s.id !== item.id)
                    .map((s) => (
                      <button key={s.id} className={item.members.includes(s.id) ? "on" : ""} aria-pressed={item.members.includes(s.id)} onClick={() => change(i, toggleMember(item, s.id))}>
                        {s.name || "sem nome"}
                      </button>
                    ))}
                </div>
              ) : (
                <>
                  <TextField
                    label="Destino do atalho"
                    width={170}
                    value={item.target}
                    placeholder="C:\Apps\app.exe, uma pasta ou https://…"
                    onCommit={(v) => change(i, { target: cleanTarget(v) })}
                  />
                  <button className="btn" title="Escolher um programa, atalho ou arquivo" onClick={() => pickApp(i)}>
                    Escolher…
                  </button>
                  <TextField
                    label="Emoji do ícone"
                    width={56}
                    value={iconKind(item.icon ?? "") === "text" ? item.icon : ""}
                    placeholder="Emoji"
                    onCommit={(v) => change(i, { icon: v })}
                  />
                </>
              )}
              {(item.icon ?? "").trim() !== "" && (
                <button className="btn" title="Voltar para a inicial do nome" onClick={() => change(i, { icon: "" })}>
                  Limpar
                </button>
              )}
              <button className="btn danger" onClick={() => set(removeShortcut(items, i))}>
                Remover
              </button>
            </div>
          ))}
        </div>
        <Row label="Adicionar" hint="Um atalho abre um app, pasta, arquivo ou site. Um grupo abre vários atalhos de uma vez">
          <button className="btn primary" disabled={items.length >= 40} onClick={() => add(false)}>
            Atalho
          </button>
          <button className="btn" disabled={items.length >= 40} onClick={() => add(true)}>
            Grupo
          </button>
        </Row>
        <Row label="Confirmar antes de abrir" hint="Apps, jogos e grupos pedem confirmação antes de abrir">
          <Toggle label="Confirmar antes de abrir" value={config.confirmApps} onChange={(v) => update({ confirmApps: v })} />
        </Row>
      </Group>
      <Group>
        {HOTKEYS.map(([label, keys]) => (
          <Row key={label} label={label}>
            <div className="kc">
              {keys.map((k) => (
                <kbd key={k}>{k}</kbd>
              ))}
            </div>
          </Row>
        ))}
      </Group>
      <p className="hint">Se outro programa já usa uma dessas teclas, ela fica de fora e as outras continuam funcionando.</p>
    </>
  );
}

/** A ordem das páginas do dock, com setas (no dock, também dá para segurar e arrastar). */
export function PagesSection() {
  const { config, update } = useConfigStore();
  const ordered = orderPages(PAGES, config.pageOrder);
  const ids = ordered.map((p) => p.id);
  const move = (from: number, to: number) => update({ pageOrder: moveItem(ids, from, to) });
  const sortable = useSortable(ids, (order) => update({ pageOrder: order }));
  const hidden = config.hiddenPages;
  const toggleHidden = (id: string) => {
    if (hidden.includes(id)) return update({ hiddenPages: hidden.filter((h) => h !== id) });
    if (ids.length - hidden.length <= 1) return; // pelo menos uma página precisa ficar à vista
    update({ hiddenPages: [...hidden, id] });
  };

  return (
    <>
      <Group>
        <div className="sortable">
        {ordered.map(({ id, label, Icon }, i) => (
          <div
            className={`row pg-row srow${sortable.dragId === id ? " drag" : ""}${hidden.includes(id) ? " hidden" : ""}`}
            key={id}
            ref={sortable.rowRef(id)}
            style={{ order: sortable.position.get(id) }}
          >
            <span className="handle" role="presentation" title="Arraste para mudar a ordem" onPointerDown={(e) => sortable.down(e, id)}>
              <GripIcon />
            </span>
            <span className="pg-ic">
              <Icon size={16} />
            </span>
            <span className="pg-name">{label}</span>
            <div className="pg-move">
              <button aria-label={`Subir ${label}`} disabled={i === 0} onClick={() => move(i, i - 1)}>
                <ArrowUpIcon />
              </button>
              <button aria-label={`Descer ${label}`} disabled={i === ordered.length - 1} onClick={() => move(i, i + 1)}>
                <ArrowDownIcon />
              </button>
            </div>
            <Toggle label={`Mostrar ${label} no dock`} value={!hidden.includes(id)} onChange={() => toggleHidden(id)} />
          </div>
        ))}
        </div>
      </Group>
      <Group>
        <Row label="Voltar à ordem original">
          <button className="btn" disabled={config.pageOrder.length === 0} onClick={() => update({ pageOrder: [] })}>
            Restaurar
          </button>
        </Row>
      </Group>
      <p className="hint">Arraste pela alça para mudar a ordem e use o interruptor para esconder uma página do dock. No dock da ilha, segure um ícone por um instante e arraste.</p>
    </>
  );
}

/** Em quais telas a ilha aparece: uma chave por tela conectada. Nenhuma marcada = só na principal. */
export function ScreensRow() {
  const { config, update } = useConfigStore();
  const [monitors, setMonitors] = useState<MonitorInfo[]>([]);
  useEffect(() => {
    let alive = true;
    const load = () => void ipc.listMonitors().then((list) => alive && setMonitors(list));
    load();
    const timer = setInterval(load, 4000); // acompanha telas ligadas e desligadas com a janela aberta
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  // O que está valendo agora: as escolhidas que existem; se nenhuma, a principal.
  const chosen = monitors.filter((m) => config.screens.includes(m.id));
  const active = new Set((chosen.length > 0 ? chosen : monitors.filter((m) => m.primary)).map((m) => m.id));
  const toggle = (id: string) => {
    const next = new Set(active);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    if (next.size === 0) return; // pelo menos uma tela precisa ficar
    update({ screens: monitors.filter((m) => next.has(m.id)).map((m) => m.id) });
  };

  return (
    <>
      {monitors.map((monitor, i) => (
        <Row
          key={monitor.id}
          label={`Tela ${i + 1}${monitor.primary ? " (principal)" : ""}`}
          hint={`${monitor.width} × ${monitor.height}${i === 0 ? ". Escolha em quais telas a ilha aparece" : ""}`}
        >
          <Toggle label={`Mostrar a ilha na tela ${i + 1}`} value={active.has(monitor.id)} onChange={() => toggle(monitor.id)} />
        </Row>
      ))}
      {monitors.length === 0 && <Row label="Telas" hint="Procurando as telas conectadas…" />}
    </>
  );
}
