import { useState } from "react";
import { useConfigStore } from "../config/useConfig";
import { newId } from "../launcher/model";
import { type AppEntry, addApps, adoptAppIcon, suggestionSections, useAppsStore, useInstalledApps, whySuggested } from "../launcher/suggestions";
import { Group, Row } from "./controls";
import "../launcher/iconPicker.css";
import "./appSuggestions.css";

/** Lembra, só neste computador, se a pessoa recolheu as sugestões (o padrão é aberto). */
const OPEN_KEY = "docky-app-suggestions-open";
const readOpen = () => {
  try {
    return localStorage.getItem(OPEN_KEY) !== "0";
  } catch {
    return true;
  }
};
const saveOpen = (open: boolean) => {
  try {
    localStorage.setItem(OPEN_KEY, open ? "1" : "0");
  } catch {
    // sem armazenamento, só não lembra
  }
};

/**
 * Sugestões de atalho a partir do que está instalado neste computador: os apps que você mais usa e os jogos da Steam e
 * da Epic Games, com um clique para adicionar (um por um ou todos de uma seção). Só procura depois que a pessoa
 * permite; a busca é local e nada sai do computador.
 */
export function AppSuggestions() {
  const { config, update } = useConfigStore();
  const apps = useInstalledApps();
  const loading = useAppsStore((s) => s.loading);
  const [open, setOpen] = useState(readOpen);
  const toggle = () => {
    setOpen(!open);
    saveOpen(!open);
  };

  if (!config.scanApps) {
    return (
      <Group>
        <Row label="Sugerir atalhos dos apps instalados" hint="Procura no Menu Iniciar, na Steam e na Epic. Tudo fica neste computador">
          <button className="btn" onClick={() => update({ scanApps: true })}>
            Permitir
          </button>
        </Row>
      </Group>
    );
  }

  const sections = suggestionSections(apps, config.shortcuts);
  const total = sections.reduce((sum, section) => sum + section.entries.length, 0);

  /** Adiciona no fim da lista (a ordem dos seus atalhos não muda) e, quando há, traz o ícone do próprio app. */
  const add = (entries: AppEntry[]) => {
    const { shortcuts, ids } = addApps(useConfigStore.getState().config.shortcuts, entries, newId);
    update({ shortcuts });
    entries.forEach((entry, i) => void adoptAppIcon(ids[i], entry));
  };

  const hint = loading ? "Procurando apps e jogos…" : total === 0 ? "Nada novo para sugerir: tudo o que foi encontrado já é atalho" : `${total} ${total === 1 ? "sugestão" : "sugestões"} a partir do que está instalado`;
  return (
    <Group>
      <Row label="Sugestões de atalhos" hint={hint}>
        <button className="btn" onClick={() => update({ scanApps: false })} title="Para de procurar apps e jogos neste computador">
          Não procurar
        </button>
        {total > 0 && (
          <button className="btn" onClick={toggle} aria-expanded={open}>
            {open ? "Ocultar" : "Mostrar"}
          </button>
        )}
      </Row>
      {open &&
        sections.map((section) => (
          <div key={section.kind} className="row sug-sec">
            <div className="ge-sec">
              <h4>
                {section.title} · {section.entries.length}
              </h4>
              <div className="ge-chips">
                {section.entries.map((entry) => (
                  <button key={entry.target} className="app" title={whySuggested(entry)} onClick={() => add([entry])}>
                    + {entry.name}
                  </button>
                ))}
              </div>
            </div>
            {section.entries.length > 1 && (
              <button className="btn" onClick={() => add(section.entries)}>
                Adicionar todos
              </button>
            )}
          </div>
        ))}
    </Group>
  );
}
