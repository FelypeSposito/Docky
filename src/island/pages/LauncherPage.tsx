import { useMemo, useState } from "react";
import { useConfigStore } from "../../config/useConfig";
import { filterShortcuts } from "../../launcher/filter";
import { useShortcutImages } from "../../launcher/icons";
import { SHORTCUT_COLORS, ShortcutIcon } from "../../launcher/ShortcutIcon";
import { ipc } from "../../lib/ipc";
import { EmptyState } from "../EmptyState";
import { SearchIcon } from "../icons";

const MAX_TILES = 6;

export function LauncherPage() {
  const shortcuts = useConfigStore((s) => s.config.shortcuts);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const matches = useMemo(() => filterShortcuts(shortcuts, query), [shortcuts, query]);
  const images = useShortcutImages(shortcuts);

  const open = (index: number) => {
    setError(null);
    ipc.launch(index).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };

  if (shortcuts.filter((s) => s.name.trim() && s.target.trim()).length === 0) {
    return (
      <EmptyState
        title="Cadastre seus atalhos"
        text="Apps, pastas e sites que você abre sempre, em Configurações, em Atalhos."
        action={{ label: "Abrir configurações", onClick: () => ipc.openSettings() }}
      />
    );
  }

  return (
    <div className="bento lc">
      <label className="tile nin">
        <span className="nin-ic">
          <SearchIcon />
        </span>
        <input
          value={query}
          placeholder="Buscar atalho…"
          autoComplete="off"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && matches[0] && open(matches[0].index)}
        />
        <kbd>Enter</kbd>
      </label>

      {error ? (
        <div className="tile lc-empty">{error}</div>
      ) : matches.length === 0 ? (
        <div className="tile lc-empty">Nenhum atalho com esse nome.</div>
      ) : (
        <div className="lgrid">
          {matches.slice(0, MAX_TILES).map(({ item, index }, i) => (
            <button key={index} className="tile lt" title={item.target} onClick={() => open(index)}>
              <ShortcutIcon shortcut={item} image={images[index]} color={SHORTCUT_COLORS[index % SHORTCUT_COLORS.length]} />
              <b>{item.name}</b>
              {i === 0 && query && <kbd>↵</kbd>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
