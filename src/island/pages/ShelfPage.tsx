import { useState } from "react";
import { useConfigStore } from "../../config/useConfig";
import { ipc } from "../../lib/ipc";
import { fileName, useShelfStore } from "../../shelf/store";
import { EmptyState } from "../EmptyState";
import { FileIcon, FolderIcon, TrayIcon } from "../icons";
import { useIslandStore } from "../store";

const COLORS = ["#4c8dff", "#8b5cf6", "#ff9f43", "#34d399"];
const MAX_FOLDERS = 4;

export function ShelfPage() {
  const folders = useConfigStore((s) => s.config.shelfFolders).slice(0, MAX_FOLDERS);
  const move = useConfigStore((s) => s.config.shelfMove);
  const { paths, dragging, clear } = useShelfStore();
  const [notice, setNotice] = useState<string | null>(null);

  const send = async (folder: { name: string; path: string }) => {
    if (paths.length === 0) return;
    try {
      const result = await ipc.shelfSend(paths, folder.path);
      const skipped = result.skipped ? ` (${result.skipped} ignorado${result.skipped > 1 ? "s" : ""}: pastas não são enviadas)` : "";
      const plural = result.sent === 1 ? "" : "s";
      setNotice(`${result.sent} arquivo${plural} ${move ? "movido" : "enviado"}${plural} para ${folder.name}${skipped}`);
      clear();
      useIslandStore.setState({ pinned: false });
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    }
    setTimeout(() => setNotice(null), 3500);
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
          action={{ label: "Abrir configurações", onClick: () => ipc.openSettings() }}
        />
      ) : (
        <div className={`dgrid${paths.length === 0 ? " off" : ""}`}>
          {folders.map((folder, i) => (
            <button key={folder.path} className="tile fd" title={folder.path} onClick={() => send(folder)}>
              <span className="fi" style={{ background: COLORS[i % COLORS.length] }}>
                <FolderIcon />
              </span>
              <div>
                <b>{folder.name}</b>
                <span>{folder.path.split(/[\\/]/).filter(Boolean).slice(-2).join(" › ")}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
