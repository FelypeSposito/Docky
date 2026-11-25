/**
 * Which system Docky runs on, for the few words and keys that differ: Windows says "Ctrl+Alt+M", "Lixeira" and
 * "Gerenciador de Credenciais"; a Mac says "⌃⌥M", "Lixo" and "Chaves".
 */
export const IS_MAC = typeof navigator !== "undefined" && /mac/i.test(navigator.platform || navigator.userAgent);

/** The modifier keys of Docky's hotkeys as the system's keyboard labels them (Control and Option on a Mac). */
export const HOTKEY_MODIFIERS: string[] = IS_MAC ? ["⌃", "⌥"] : ["Ctrl", "Alt"];

/** A Docky hotkey as the system writes it: "Ctrl+Alt+M" on Windows, "⌃⌥M" on a Mac. */
export const hotkey = (key: string): string => (IS_MAC ? `⌃⌥${key}` : `Ctrl+Alt+${key}`);
