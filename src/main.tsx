import React from "react";
import ReactDOM from "react-dom/client";
import { useConfigStore, useConfigSync } from "./config/useConfig";
import { ipc, isTauri } from "./lib/ipc";
import { Island } from "./island/Island";
import { Settings } from "./settings/Settings";
import "@fontsource-variable/inter/wght.css";
import "./index.css";
import { resolveLanguage, setLanguage } from "./i18n";

/** Cada janela do Tauri carrega este mesmo app; o nome dela decide o que desenhar. */
async function windowLabel(): Promise<string> {
  if (isTauri) {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    return getCurrentWindow().label;
  }
  // No navegador (npm run dev): http://localhost:1420/?w=settings abre a janela de configurações.
  return new URLSearchParams(location.search).get("w") ?? "island";
}

function Root({ label }: { label: string }) {
  useConfigSync();
  const reduceMotion = useConfigStore((s) => s.config.reduceMotion);
  const setting = useConfigStore((s) => s.config.language);
  // The language is set before this render, and the whole window redraws (key) when it changes.
  const language = resolveLanguage(setting, navigator.language);
  setLanguage(language);
  React.useEffect(() => {
    document.documentElement.classList.toggle("reduce-motion", reduceMotion);
  }, [reduceMotion]);
  return label === "settings" ? <Settings key={language} /> : <Island key={language} />;
}

// Errors nobody caught go to Docky's log file, so a bug report can carry them.
window.addEventListener("error", (e) => ipc.log("error", `${e.message} (${e.filename}:${e.lineno})`));
window.addEventListener("unhandledrejection", (e) => ipc.log("error", `promessa sem tratamento: ${e.reason instanceof Error ? e.reason.message : String(e.reason)}`));

windowLabel().then((label) => {
  document.body.dataset.window = label;
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <Root label={label} />
    </React.StrictMode>,
  );
});
