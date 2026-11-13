import { useConfigStore } from "../../config/useConfig";
import { newId } from "../../launcher/model";
import {
  type AppEntry,
  MIN_GROUP,
  TEMPLATES,
  addApps,
  adoptAppIcon,
  buildGroup,
  completeGroup,
  resolveTemplate,
  suggestionSections,
  useAppsStore,
  useInstalledApps,
  whySuggested,
} from "../../launcher/suggestions";
import { QButton, QPanel, QRow, QTitle } from "./controls";

/** Sugestões de grupos e de apps para virar atalho, na tela maior dos atalhos (modo Editar). */
export function Suggestions({ onClose }: { onClose: () => void }) {
  const shortcuts = useConfigStore((s) => s.config.shortcuts);
  const update = useConfigStore((s) => s.update);
  const scanApps = useConfigStore((s) => s.config.scanApps);
  const apps = useInstalledApps();
  const loading = useAppsStore((s) => s.loading || !s.loaded);
  const sections = suggestionSections(apps, shortcuts, 10);
  /** No fim da lista (a ordem dos seus atalhos não muda) e com o ícone do próprio app, quando ele tem. */
  const add = (entry: AppEntry) => {
    const { shortcuts: next, ids } = addApps(useConfigStore.getState().config.shortcuts, [entry], newId);
    update({ shortcuts: next });
    void adoptAppIcon(ids[0], entry);
  };

  return (
    <QPanel>
      <div className="qs-line sg-head">
        <b>Sugestões</b>
        <span className="qs-note">Grupos prontos e os apps e jogos que você tem</span>
        <QButton tone="primary" onClick={onClose}>
          Pronto
        </QButton>
      </div>

      <QTitle>Grupos prontos</QTitle>
      {TEMPLATES.map((template) => {
        const resolved = resolveTemplate(template, shortcuts, apps);
        const ready = resolved.found >= MIN_GROUP && !resolved.exists;
        const completable = resolved.exists && resolved.missing > 0;
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
              tone={ready || completable ? "primary" : undefined}
              disabled={!ready && !completable}
              title={
                completable
                  ? `Põe no grupo que você já tem: ${resolved.missing} ${resolved.missing === 1 ? "app" : "apps"}`
                  : resolved.exists
                    ? "O grupo já tem todos os apps"
                    : ready
                      ? undefined
                      : `Precisa de pelo menos ${MIN_GROUP} apps`
              }
              onClick={() => update({ shortcuts: completable ? completeGroup(template, shortcuts, apps, newId) : buildGroup(template, shortcuts, apps, newId) })}
            >
              {completable ? `Completar (+${resolved.missing})` : resolved.exists ? "Criado" : "Criar"}
            </QButton>
          </QRow>
        );
      })}

      {!scanApps ? (
        <>
          <QTitle>Apps e jogos instalados</QTitle>
          <QRow label="Procurar no computador" hint="Menu Iniciar, Steam e Epic Games. A busca é só local: nada sai do computador.">
            <QButton tone="primary" onClick={() => update({ scanApps: true })}>
              Permitir
            </QButton>
          </QRow>
        </>
      ) : (
        <>
          {loading && apps.length === 0 && <p className="qs-note sg-note">Procurando apps e jogos instalados…</p>}
          {!loading && sections.length === 0 && <p className="qs-note sg-note">Nenhum app ou jogo novo para sugerir.</p>}
          {sections.map((section) => (
            <div key={section.kind}>
              <QTitle>{section.kind === "app" ? "Apps que você mais usa" : section.title}</QTitle>
              {section.entries.map((entry) => (
                <QRow key={entry.target} label={entry.name} hint={whySuggested(entry)}>
                  <QButton onClick={() => add(entry)}>+ Adicionar</QButton>
                </QRow>
              ))}
            </div>
          ))}
        </>
      )}
    </QPanel>
  );
}
