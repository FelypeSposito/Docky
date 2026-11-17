import { useConfigStore } from "../config/useConfig";
import { ipc } from "../lib/ipc";
import { siteName } from "./link";
import { newId } from "./model";

/** Adds a shortcut for a pasted link (once) and asks for the site's icon, which comes from its favicon. */
export function addSiteShortcut(url: string): void {
  const { config, update } = useConfigStore.getState();
  if (!config.shortcuts.some((s) => s.target === url)) {
    update({ shortcuts: [...config.shortcuts, { id: newId(), name: siteName(url), target: url, icon: "", group: false, members: [] }] });
  }
  // The new shortcut has to reach the saved config before the icon search reads it.
  setTimeout(() => void ipc.fetchMissingIcons().catch(() => {}), 1200);
}
