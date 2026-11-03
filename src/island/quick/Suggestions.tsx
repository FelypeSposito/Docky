import { useConfigStore } from "../../config/useConfig";
import { newId } from "../../launcher/model";
import { MIN_GROUP, TEMPLATES, addApp, buildGroup, resolveTemplate, suggestedApps, useAppsStore, useInstalledApps, whySuggested } from "../../launcher/suggestions";
import { QButton, QPanel, QRow, QTitle } from "./controls";

/** Sugestões de grupos e de apps para virar atalho, na tela maior dos atalhos (modo Editar). */
export function Suggestions({ onClose }: { onClose: () => void }) {
  const shortcuts = useConfigStore((s) => s.config.shortcuts);
  const update = useConfigStore((s) => s.update);
  const apps = useInstalledApps();
  const loading = useAppsStore((s) => s.loading || !s.loaded);
  const top = suggestedApps(apps, shortcuts, 10);

  return (
    <QPanel>
      <div className="qs-line sg-head">
        <b>Sugestões</b>
        <span className="qs-note">Grupos prontos e os apps que você mais usa</span>
        <QButton tone="primary" onClick={onClose}>
          Pronto
        </QButton>
      </div>

      <QTitle>Grupos prontos</QTitle>
      {TEMPLATES.map((template) => {
        const resolved = resolveTemplate(template, shortcuts, apps);
        const ready = resolved.found >= MIN_GROUP && !resolved.exists;
        return (
          <QRow key={template.id} label={template.name} hint={template.blurb}>
            <div className="sg-chips" aria-label={`Apps de ${template.name}`}>
              {resolved.apps.map((item) => (
                <span key={item.label} className={item.shortcutId || item.app ? "on" : ""} title={item.shortcutId ? "Você já tem este atalho" : item.app ? "Instalado: será adicionado" : "Não encontrei este app"}>
                  {item.label}
                </span>
              ))}
            </div>
            <QButton
              tone={ready ? "primary" : undefined}
              disabled={!ready}
              title={resolved.exists ? "Você já tem um grupo com esse nome" : ready ? undefined : `Precisa de pelo menos ${MIN_GROUP} apps`}
              onClick={() => update({ shortcuts: buildGroup(template, shortcuts, apps, newId) })}
            >
              {resolved.exists ? "Criado" : "Criar"}
            </QButton>
          </QRow>
        );
      })}

      <QTitle>Apps que você mais usa</QTitle>
      {loading && apps.length === 0 && <p className="qs-note sg-note">Procurando os apps instalados…</p>}
      {!loading && top.length === 0 && <p className="qs-note sg-note">Nenhum app novo para sugerir.</p>}
      {top.map((entry) => (
        <QRow key={entry.target} label={entry.name} hint={whySuggested(entry)}>
          <QButton onClick={() => update({ shortcuts: addApp(shortcuts, entry, newId) })}>+ Adicionar</QButton>
        </QRow>
      ))}
    </QPanel>
  );
}
