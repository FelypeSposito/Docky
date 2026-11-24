import { useState } from "react";
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
  entryName,
  resolveTemplate,
  suggestionSections,
  useAppsStore,
  useInstalledApps,
  whySuggested,
} from "../../launcher/suggestions";
import { QButton, QPanel, QRow, QTitle } from "./controls";
import { t } from "../../i18n";

/** Sugestões de grupos e de apps para virar atalho, na tela maior dos atalhos (modo Editar). */
export function Suggestions({ onClose }: { onClose: () => void }) {
  const shortcuts = useConfigStore((s) => s.config.shortcuts);
  const update = useConfigStore((s) => s.update);
  const scanApps = useConfigStore((s) => s.config.scanApps);
  const apps = useInstalledApps();
  const loading = useAppsStore((s) => s.loading || !s.loaded);
  const sections = suggestionSections(apps, shortcuts);
  /** The sections opened past their first entries ("Mostrar todos"). */
  const [full, setFull] = useState<string[]>([]);
  /** No fim da lista (a ordem dos seus atalhos não muda) e com o ícone do próprio app, quando ele tem. */
  const add = (entry: AppEntry) => {
    const { shortcuts: next, ids } = addApps(useConfigStore.getState().config.shortcuts, [entry], newId);
    update({ shortcuts: next });
    void adoptAppIcon(ids[0], entry);
  };

  return (
    <QPanel>
      <div className="qs-line sg-head">
        <b>{t("Sugestões")}</b>
        <span className="qs-note">{t("Grupos prontos e os apps e jogos que você tem")}</span>
        <QButton tone="primary" onClick={onClose}>
          {t("Pronto")}
        </QButton>
      </div>

      <QTitle>{t("Grupos prontos")}</QTitle>
      {TEMPLATES.map((template) => {
        const resolved = resolveTemplate(template, shortcuts, apps);
        const ready = resolved.found >= MIN_GROUP && !resolved.exists;
        const completable = resolved.exists && resolved.missing > 0;
        return (
          <QRow key={template.id} label={t(template.name)} hint={t(template.blurb)}>
            <div className="sg-chips" aria-label={t("Apps de {name}", { name: t(template.name) })}>
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
                  ? t("Põe no grupo que você já tem: {n} apps", { n: resolved.missing })
                  : resolved.exists
                    ? t("O grupo já tem todos os apps")
                    : ready
                      ? undefined
                      : t("Precisa de pelo menos {n} apps", { n: MIN_GROUP })
              }
              onClick={() => update({ shortcuts: completable ? completeGroup(template, shortcuts, apps, newId) : buildGroup(template, shortcuts, apps, newId) })}
            >
              {completable ? t("Completar (+{n})", { n: resolved.missing }) : t(resolved.exists ? "Criado" : "Criar")}
            </QButton>
          </QRow>
        );
      })}

      {!scanApps ? (
        <>
          <QTitle>{t("Apps e jogos instalados")}</QTitle>
          <QRow label={t("Procurar no computador")} hint={t("Menu Iniciar, Steam e Epic Games. A busca é só local: nada sai do computador.")}>
            <QButton tone="primary" onClick={() => update({ scanApps: true })}>
              {t("Permitir")}
            </QButton>
          </QRow>
        </>
      ) : (
        <>
          {loading && apps.length === 0 && <p className="qs-note sg-note">{t("Procurando apps e jogos instalados…")}</p>}
          {!loading && sections.length === 0 && <p className="qs-note sg-note">{t("Nenhum app ou jogo novo para sugerir.")}</p>}
          {sections.map((section) => (
            <div key={section.kind}>
              <QTitle>{t(section.title)}</QTitle>
              {section.entries.slice(0, full.includes(section.kind) ? Infinity : section.shown).map((entry) => (
                <QRow key={entry.target} label={entryName(entry)} hint={whySuggested(entry)}>
                  <QButton onClick={() => add(entry)}>{t("+ Adicionar")}</QButton>
                </QRow>
              ))}
              {!full.includes(section.kind) && section.entries.length > section.shown && (
                <QRow label={t("Mostrar todos ({n})", { n: section.entries.length })}>
                  <QButton onClick={() => setFull([...full, section.kind])}>{t("Mostrar")}</QButton>
                </QRow>
              )}
            </div>
          ))}
        </>
      )}
    </QPanel>
  );
}
