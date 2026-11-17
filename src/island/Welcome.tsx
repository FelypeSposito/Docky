import { useConfigStore } from "../config/useConfig";
import { ipc } from "../lib/ipc";
import { useIslandStore } from "./store";

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
    <div className="welcome" role="dialog" aria-label="Boas-vindas ao Docky">
      <div className="wl-head">
        <b>Oi! Eu sou o Docky.</b>
        <span>Três coisas para começar:</span>
      </div>
      <div className="wl-tips">
        <div className="tile wl-tip">
          <span className="wl-k">mouse</span>
          <b>Passe o mouse</b>
          <span>A ilha abre sozinha. Um clique a deixa aberta.</span>
        </div>
        <div className="tile wl-tip">
          <span className="wl-k">Ctrl Alt D</span>
          <b>De qualquer lugar</b>
          <span>Abre e fecha a ilha. Ctrl+Alt+N anota algo rápido.</span>
        </div>
        <div className="tile wl-tip">
          <span className="wl-k">atalhos</span>
          <b>A um clique</b>
          <span>Apps, jogos e sites que você usa, na página Atalhos.</span>
        </div>
      </div>
      <div className="wl-act">
        <button className="nbtn" onClick={() => done(() => ipc.openSettings("atalhos"))}>
          Criar atalhos
        </button>
        <button className="nbtn go" autoFocus onClick={() => done()}>
          Começar
        </button>
      </div>
    </div>
  );
}
