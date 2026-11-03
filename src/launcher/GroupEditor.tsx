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
 * Os itens de um grupo, num painel só (a linha do grupo fica limpa): o que já está nele e o que dá para pôr,
 * entre os seus atalhos e os apps instalados. Grava a cada clique.
 */
export function GroupEditor({ group, shortcuts, onChange, onDone }: GroupEditorProps) {
  const apps = useInstalledApps();
  const inside = membersOf(group, shortcuts);
  const others = shortcuts.filter((s) => !s.group && s.id !== group.id && !group.members.includes(s.id) && s.name.trim());
  const installed = suggestedApps(apps, shortcuts, 14);
  const save = (next: Shortcut) => onChange(shortcuts.map((s) => (s.id === next.id ? next : s)));

  return (
    <div className="ip ge" role="dialog" aria-label={`Itens de ${group.name || "grupo"}`}>
      <div className="ip-head">
        <div className="ip-title">
          <b>Itens de {group.name || "grupo"}</b>
          <span>Abrem juntos, na ordem em que foram adicionados</span>
        </div>
        <button className="ip-btn primary" onClick={onDone}>
          Pronto
        </button>
      </div>

      <div className="ge-sec">
        <h4>No grupo</h4>
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
