import { useConfigStore } from "../config/useConfig";
import { useIslandStore } from "./store";

/**
 * Switches a page between the island's normal and large size, and remembers it: the page opens that way next time
 * (Atalhos starts large). Making it large also keeps the island open, as the expand button always did.
 */
export function toggleLargePage(pageId: string): void {
  const { config, update } = useConfigStore.getState();
  const large = config.largePages.includes(pageId);
  update({ largePages: large ? config.largePages.filter((id) => id !== pageId) : [...config.largePages, pageId] });
  if (!large) useIslandStore.setState({ pinned: true });
}
