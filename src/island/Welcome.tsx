import { useConfigStore } from "../config/useConfig";
import { ipc } from "../lib/ipc";
import { useIslandStore } from "./store";
import { t } from "../i18n";

/**
 * The first time Docky opens, the island opens itself on this card: how it opens, the keys that work from anywhere,
 * and where the shortcuts are made. "Começar" closes it for good (config `onboarded`).
 */
export function Welcome() {
  const update = useConfigStore((s) => s.update);
  const done = (then?: () => void) => {
    update({ onboarded: true });
    useIslandStore.getState().collapse();
    then?.();
  };
  return (
    <div className="welcome" role="dialog" aria-label={t("Boas-vindas ao Docky")}>
      <div className="wl-head">
        <b>{t("Oi! Eu sou o Docky.")}</b>
        <span>{t("Três coisas para começar:")}</span>
      </div>
      <div className="wl-tips">
        <div className="tile wl-tip">
          <span className="wl-k">{t("mouse")}</span>
          <b>{t("Passe o mouse")}</b>
          <span>{t("A ilha abre sozinha. Um clique a deixa aberta.")}</span>
        </div>
        <div className="tile wl-tip">
          <span className="wl-k">{t("Ctrl Alt D")}</span>
          <b>{t("De qualquer lugar")}</b>
          <span>{t("Abre e fecha a ilha. Ctrl+Alt+N anota algo rápido.")}</span>
        </div>
        <div className="tile wl-tip">
          <span className="wl-k">{t("atalhos")}</span>
          <b>{t("A um clique")}</b>
          <span>{t("Apps, jogos e sites que você usa, na página Atalhos.")}</span>
        </div>
      </div>
      <div className="wl-act">
        <button className="nbtn" onClick={() => done(() => ipc.openSettings("atalhos"))}>
          {t("Criar atalhos")}
        </button>
        <button className="nbtn go" autoFocus onClick={() => done()}>
          {t("Começar")}
        </button>
      </div>
    </div>
  );
}
