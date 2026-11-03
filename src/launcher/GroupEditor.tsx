import { useEffect, useState } from "react";
import type { Shortcut } from "../config/types";
import { membersOf, newId, toggleMember } from "./model";
import { type AppEntry, addAppToGroup, suggestedApps, useInstalledApps, whySuggested } from "./suggestions";
import "./iconPicker.css";

interface GroupEditorProps {
  group: Shortcut;
  shortcuts: Shortcut[];
  /** Grava a lista de atalhos nova (o grupo e, se preciso, os atalhos criados a partir de apps instalados). */
  onChange: (shortcuts: Shortcut[]) => void;
  onDone: () => void;
}

/**
 * O nome e os itens de um grupo, num painel só (a linha do grupo fica limpa): o que já está nele e o que dá para pôr,
 * entre os seus atalhos e os apps instalados. Grava a cada clique. Os atalhos criados aqui ficam ocultos da lista.
 */
export function GroupEditor({ group, shortcuts, onChange, onDone }: GroupEditorProps) {
  const apps = useInstalledApps();
  const [name, setName] = useState(group.name);
  const [query, setQuery] = useState("");
  useEffect(() => setName(group.name), [group.name]);

  const q = query.trim().toLowerCase();
  const matches = (text: string) => !q || text.toLowerCase().includes(q);
  const inside = membersOf(group, shortcuts);
  const others = shortcuts.filter((s) => !s.group && s.id !== group.id && !group.members.includes(s.id) && s.name.trim() && matches(s.name));
  const installed = (q ? apps.filter((a) => matches(a.name) && !shortcuts.some((s) => !s.group && s.name.trim().toLowerCase() === a.name.trim().toLowerCase())) : suggestedApps(apps, shortcuts, 14)).slice(0, 24);
  const save = (next: Shortcut) => onChange(shortcuts.map((s) => (s.id === next.id ? next : s)));
  const rename = () => name.trim() !== group.name && save({ ...group, name: name.trim() });

  return (
    <div className="ip ge" role="dialog" aria-label={`Itens de ${group.name || "grupo"}`}>
      <div className="ip-head">
        <input
          className="ge-name"
          value={name}
          placeholder="Nome do grupo"
          aria-label="Nome do grupo"
          autoFocus={!group.name}
          onChange={(e) => setName(e.target.value)}
          onBlur={rename}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        />
        <input className="ge-search" value={query} placeholder="Buscar atalho ou app…" aria-label="Buscar atalho ou app" onChange={(e) => setQuery(e.target.value)} />
        <button
          className="ip-btn primary"
          onClick={() => {
            rename();
            onDone();
          }}
        >
          Pronto
        </button>
      </div>

      <div className="ge-sec">
        <h4>No grupo · abrem juntos, na ordem em que foram adicionados</h4>
        <div className="ge-chips">
          {inside.length === 0 && <span className="ge-note">Nada ainda. Escolha abaixo.</span>}
          {inside.map((s) => (
            <button key={s.id} className="on" title="Tirar do grupo" onClick={() => save(toggleMember(group, s.id))}>
              {s.name || "sem nome"} <i>✕</i>
            </button>
          ))}
        </div>
      </div>

      {others.length > 0 && (
        <div className="ge-sec">
          <h4>Seus atalhos</h4>
          <div className="ge-chips">
            {others.map((s) => (
              <button key={s.id} onClick={() => save(toggleMember(group, s.id))}>
                + {s.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {installed.length > 0 && (
        <div className="ge-sec">
          <h4>Apps instalados</h4>
          <div className="ge-chips">
            {installed.map((entry: AppEntry) => (
              <button key={entry.target} className="app" title={whySuggested(entry)} onClick={() => onChange(addAppToGroup(shortcuts, group.id, entry, newId))}>
                + {entry.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
