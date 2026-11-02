import { useEffect, useState } from "react";
import { useConfigStore } from "../config/useConfig";
import type { ShelfFolder, Shortcut } from "../config/types";
import { ArrowDownIcon, ArrowUpIcon, GripIcon } from "../island/icons";
import { moveItem, orderPages } from "../island/pageOrder";
import { PAGES } from "../island/pages/registry";
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
            <TextField label="Caminho da pasta" width={280} value={folder.path} placeholder="C:\Users\você\Google Drive\Faculdade" onCommit={(v) => change(i, { path: v })} />
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
  // Cada linha é identificada pela posição atual; ao soltar, a lista é remontada na nova ordem.
  const sortable = useSortable(
    items.map((_, i) => String(i)),
    (order) => set(order.map((id) => items[Number(id)])),
  );

  return (
    <>
      <Group>
        {items.length === 0 && <Row label="Nenhum atalho ainda" hint="Apps, pastas, arquivos e sites que você abre sempre" />}
        <div className="sortable">
        {items.map((item, i) => (
          <div
            className={`row folder-row srow${sortable.dragId === String(i) ? " drag" : ""}`}
            key={i}
            ref={sortable.rowRef(String(i))}
            style={{ order: sortable.position.get(String(i)) }}
          >
            <span className="handle" role="presentation" title="Arraste para mudar a ordem" onPointerDown={(e) => sortable.down(e, String(i))}>
              <GripIcon />
            </span>
            <TextField label="Nome do atalho" width={110} value={item.name} placeholder="Nome" onCommit={(v) => change(i, { name: v })} />
            <TextField
              label="Destino do atalho"
              width={280}
              value={item.target}
              placeholder="C:\Apps\app.exe, uma pasta ou https://…"
              onCommit={(v) => change(i, { target: v })}
            />
            <button className="btn danger" onClick={() => set(items.filter((_, k) => k !== i))}>
              Remover
            </button>
          </div>
        ))}
        </div>
        <Row label="Adicionar atalho" hint="Só os atalhos desta lista podem ser abertos pela ilha">
          <button className="btn primary" disabled={items.length >= 12} onClick={() => set([...items, { name: "", target: "" }])}>
            Adicionar
          </button>
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
