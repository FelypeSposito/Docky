import React from "react";
import ReactDOM from "react-dom/client";
import { useConfigStore, useConfigSync } from "./config/useConfig";
import { isTauri } from "./lib/ipc";
import { Island } from "./island/Island";
import { Settings } from "./settings/Settings";
import "./index.css";

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
  React.useEffect(() => {
    document.documentElement.classList.toggle("reduce-motion", reduceMotion);
  }, [reduceMotion]);
  return label === "settings" ? <Settings /> : <Island />;
}

windowLabel().then((label) => {
  document.body.dataset.window = label;
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <Root label={label} />
    </React.StrictMode>,
  );
});
