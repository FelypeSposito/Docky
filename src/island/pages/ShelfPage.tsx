import { useEffect, useMemo, useState } from "react";
import { useConfigStore } from "../../config/useConfig";
import { ipc } from "../../lib/ipc";
import { useShelfImages } from "../../launcher/icons";
import { ItemIcon } from "../../launcher/ShortcutIcon";
import { folderHint, reorderFolders, usableFolderEntries } from "../../shelf/folders";
import { fileName, useShelfStore } from "../../shelf/store";
import { EmptyState } from "../EmptyState";
import { FileIcon, FolderIcon, TrashIcon, TrayIcon } from "../icons";
import { useIslandStore } from "../store";
import { useGridSort } from "../useGridSort";

const COLORS = ["#4c8dff", "#8b5cf6", "#ff9f43", "#34d399"];
const MAX_FOLDERS = 4;

/** "vazia", "1 item", "12 itens": what the Recycle Bin tile says under its name. */
const binLabel = (count: number | null) => (count === null ? "" : count === 0 ? "vazia" : count === 1 ? "1 item" : `${count} itens`);

export function ShelfPage({ active }: { active: boolean }) {
  const configured = useConfigStore((s) => s.config.shelfFolders);
  const folders = useMemo(() => usableFolderEntries(configured).slice(0, MAX_FOLDERS), [configured]);
  const images = useShelfImages(configured);
  const move = useConfigStore((s) => s.config.shelfMove);
  const update = useConfigStore((s) => s.update);
  // Arrastar uma pasta muda a ordem dela na lista das configurações (a posição na lista é o id).
  const sorter = useGridSort(
    folders.map((e) => String(e.index)),
    (order) => update({ shelfFolders: reorderFolders(configured, order.map(Number)) }),
  );
  const { paths, dragging, clear } = useShelfStore();
  const [notice, setNotice] = useState<string | null>(null);
  const [binCount, setBinCount] = useState<number | null>(null);

  // The Recycle Bin count is read when the page opens, never polled.
  useEffect(() => {
    if (active) void ipc.recycleBinCount().then(setBinCount);
  }, [active]);

  const flash = (text: string) => {
    setNotice(text);
    setTimeout(() => setNotice(null), 3500);
  };

  /** With files on the shelf, the Recycle Bin takes them; without, it opens in Explorer. */
  const trash = async () => {
    if (paths.length === 0) {
      void ipc.openRecycleBin();
      return;
    }
    try {
      const result = await ipc.shelfTrash(paths);
      const skipped = result.skipped ? ` (${result.skipped} ${result.skipped === 1 ? "ficou" : "ficaram"} de fora)` : "";
      flash(`${result.sent === 1 ? "1 item foi" : `${result.sent} itens foram`} para a Lixeira${skipped}`);
      clear();
      useIslandStore.setState({ pinned: false });
      void ipc.recycleBinCount().then(setBinCount);
    } catch (e) {
      flash(e instanceof Error ? e.message : String(e));
    }
  };

  const send = async (folder: { name: string; path: string }) => {
    if (paths.length === 0) return;
    try {
      const result = await ipc.shelfSend(paths, folder.path);
      const skipped = result.skipped ? ` (${result.skipped} ignorado${result.skipped > 1 ? "s" : ""}: pastas não são enviadas)` : "";
      const plural = result.sent === 1 ? "" : "s";
      flash(`${result.sent} arquivo${plural} ${move ? "movido" : "enviado"}${plural} para ${folder.name}${skipped}`);
      clear();
      useIslandStore.setState({ pinned: false });
    } catch (e) {
      flash(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="bento sh">
      <div className={`tile drop${dragging ? " over" : ""}`}>
        {notice ? (
          <div className="dz">
            <b>{notice}</b>
          </div>
        ) : paths.length > 0 ? (
          <div className="files">
            {paths.slice(0, 3).map((p) => (
              <span key={p} className="file" title={p}>
                <FileIcon />
                {fileName(p)}
              </span>
            ))}
            {paths.length > 3 && <span className="file">+{paths.length - 3} arquivos</span>}
            <button className="link" onClick={clear}>
              Limpar
            </button>
          </div>
        ) : (
          <div className="dz">
            <TrayIcon size={28} stroke={1.5} />
            <div>
              <b>Solte arquivos aqui</b>
              <span>ou arraste para a ilha</span>
            </div>
          </div>
        )}
      </div>

      {folders.length === 0 ? (
        <EmptyState
          title="Falta cadastrar as pastas"
          text="Escolha os destinos em Configurações, em Shelf."
          action={{ label: "Abrir configurações", onClick: () => ipc.openSettings("shelf") }}
        />
      ) : (
        <div className={`dgrid${paths.length === 0 ? " off" : ""}`}>
          {folders.map(({ folder, index }, i) => (
            <button
              key={folder.path}
              ref={sorter.tileRef(String(index))}
              className={`tile fd${sorter.dragId === String(index) ? " drag" : ""}`}
              style={{ order: sorter.position.get(String(index)) }}
              title={`${folder.name} (${folderHint(folder)})\n${folder.path}`}
              onClick={() => send(folder)}
              onPointerDown={(e) => sorter.down(e, String(index))}
              onDragStart={(e) => e.preventDefault()}
            >
              <ItemIcon icon={folder.icon ?? ""} image={images[index]} color={COLORS[i % COLORS.length]} className="fi" empty={<FolderIcon />} />
              <b>{folder.name}</b>
            </button>
          ))}
        </div>
      )}

      <button
        className={`tile fd bin${paths.length > 0 ? " armed" : ""}`}
        title={paths.length > 0 ? "Mandar para a Lixeira (dá para restaurar depois)" : "Abrir a Lixeira"}
        onClick={trash}
      >
        <span className="fi">
          <TrashIcon size={15} stroke={1.8} />
        </span>
        <span className="bin-tx">
          <b>Lixeira</b>
          <span>{paths.length > 0 ? "enviar" : binLabel(binCount)}</span>
        </span>
      </button>
    </div>
  );
}
