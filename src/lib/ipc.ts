import type { ClaudeEvent, PermissionRequest } from "../claude/sessions";
import type { CalEvent } from "../calendar/events";
import type { AppEntry } from "../launcher/suggestions";
import type { CalendarStatus } from "../calendar/store";
import { type Config, DEFAULT_CONFIG } from "../config/types";

/**
 * Única porta entre o frontend e o Rust. Fora do Tauri (por exemplo `npm run dev` no navegador)
 * cada função tem um substituto simples, para dar para desenvolver a interface sem compilar o Rust.
 */

export interface Power {
  hasBattery: boolean;
  percent: number;
  charging: boolean;
  plugged: boolean;
}

export interface Media {
  app: string;
  title: string;
  artist: string;
  album: string;
  playing: boolean;
  positionMs: number;
  durationMs: number;
  /** Data URL da capa; só vem quando a faixa muda. */
  thumbnail: string | null;
  /** Aleatório ligado ou não; null quando o app não deixa mudar por fora. */
  shuffle: boolean | null;
  /** Repetir: nada, a faixa ou a lista; null quando o app não deixa mudar por fora. */
  repeat: RepeatMode | null;
}

export type RepeatMode = "none" | "track" | "list";

/** One text in the clipboard history (Copiados). The whole text stays on the Rust side. */
export interface ClipItem {
  id: number;
  /** The start of the text, spacing tidied for a short card. */
  preview: string;
  chars: number;
  /** Unix ms */
  at: number;
}

let devClips: ClipItem[] = [
  { id: 3, preview: "https://github.com/FelypeSposito/Docky", chars: 38, at: Date.now() - 40_000 },
  { id: 2, preview: "Reunião remarcada para quinta às 15h, mesmo link do Meet.", chars: 58, at: Date.now() - 12 * 60_000 },
  { id: 1, preview: "npm run tauri build", chars: 19, at: Date.now() - 3 * 3_600_000 },
];
const devClipsChanged = () => window.dispatchEvent(new CustomEvent("docky:clipboard", { detail: devClips }));

export interface Mic {
  muted: boolean;
}

export type OutputKind = "headphones" | "speakers" | "display" | "other";

export interface AudioOutput {
  id: string;
  /** Windows' name, e.g. "Fones de ouvido (UGREEN Studio Pro)". */
  name: string;
  kind: OutputKind;
  default: boolean;
}

export interface AudioState {
  outputs: AudioOutput[];
  /** null without a microphone. */
  mic: Mic | null;
}

/** Why `setOutput` failed: Windows refused, or another app (a sound enhancer) made itself the default again. */
export type SwitchError = { kind: "refused" } | { kind: "takenBack"; by: string };

let devOutput = "b";

/** A quick reminder ("15 min tirar a pizza"), kept on the Rust side until it fires. */
export interface Reminder {
  id: number;
  text: string;
  /** Unix ms */
  at: number;
}

let devReminders: Reminder[] = [];
const devRemindersChanged = () => window.dispatchEvent(new CustomEvent("docky:reminders", { detail: [...devReminders] }));

/** Bluetooth headphones just connected (with their charge), or their charge just ran low. */
export interface BatteryNotice {
  name: string;
  percent: number;
  low: boolean;
}

export interface DownloadDone {
  name: string;
  path: string;
}

/** An app using the microphone now (a call). */
export interface Call {
  app: string;
  /** Unix ms */
  since: number;
}

export interface DiscordMember {
  id: string;
  name: string;
  speaking: boolean;
  muted: boolean;
}

/** The Discord call, through Discord's local RPC. */
export interface DiscordState {
  status: "off" | "closed" | "authorize" | "ready";
  /** The voice channel you are in; null outside a call. */
  channel: string | null;
  muted: boolean;
  deafened: boolean;
  members: DiscordMember[];
}

export interface DiscordSetup {
  secretSaved: boolean;
  redirect: string;
  error: string | null;
}

export type DiscordAction = "authorize" | "mute" | "unmute" | "deafen" | "undeafen" | "leave" | "forget";

/** A long fullscreen session that just ended. */
export interface FullscreenSummary {
  app: string;
  minutes: number;
  /** A browser or player: a video, not a game. */
  video: boolean;
}

/** Um app no mixer: as sessões de áudio dele somadas, como no mixer de volume do Windows. */
export interface AudioApp {
  /** Caminho do programa, ou "system" para os sons do Windows. */
  id: string;
  name: string;
  /** PNG em data URL. */
  icon: string | null;
  /** 0 a 1 */
  volume: number;
  muted: boolean;
  /** Tocando algo agora. */
  active: boolean;
}

export interface Volume {
  /** 0 a 1 */
  level: number;
  muted: boolean;
}

export type MediaAction = "toggle" | "next" | "previous" | "shuffle-on" | "shuffle-off" | "repeat-none" | "repeat-track" | "repeat-list";

export interface ClaudeStatus {
  /** Porta do servidor local; 0 se não subiu. */
  port: number;
  hooksInstalled: boolean;
  settingsPath: string;
}

export interface Weather {
  city: string;
  temperature: number;
  /** Código WMO do tempo (0 = limpo, 61 = chuva…). */
  code: number;
  max: number;
  min: number;
  hourly: number[];
  feelsLike: number | null;
  humidity: number | null;
  windKmh: number | null;
  precipitationMm: number | null;
  uvMax: number | null;
  /** Maior chance de chuva do dia (%). */
  rainMax: number | null;
  sunrise: string | null;
  sunset: string | null;
  /** As próximas 12 horas, uma a uma. */
  hours: { hour: number; temp: number; rain: number; code: number }[];
}

export interface MonitorInfo {
  id: string;
  width: number;
  height: number;
  primary: boolean;
}

export interface Note {
  file: string;
  text: string;
  /** Última modificação, em milissegundos desde 1970 */
  modifiedMs: number;
}

export interface FileDropEvent {
  type: "enter" | "leave" | "drop";
  paths: string[];
}

export type Hotkey = "toggle" | "next" | "previous" | "notes";

export interface HooksPlan {
  settingsPath: string;
  backupPath: string;
  events: string[];
  exampleCommand: string;
}

export interface Point {
  x: number;
  y: number;
}

export interface Rect extends Point {
  w: number;
  h: number;
}

type Unlisten = () => void;

export const isTauri = "__TAURI_INTERNALS__" in globalThis;

async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, args);
}

async function listen<T>(event: string, handler: (payload: T) => void): Promise<Unlisten> {
  // Escuta só como ESTA janela: o `listen` solto recebe os eventos de todas as janelas, e com a ilha em duas telas
  // o hover e o "clique fora" de uma abriam e fechavam a outra. Eventos para todos (`emit`) continuam chegando.
  const { getCurrentWebviewWindow } = await import("@tauri-apps/api/webviewWindow");
  return getCurrentWebviewWindow().listen<T>(event, (e) => handler(e.payload));
}

/** Registra um ouvinte assíncrono e devolve uma função de cancelamento síncrona. */
function subscribe<T>(event: string, handler: (payload: T) => void): Unlisten {
  let cancelled = false;
  let unlisten: Unlisten | undefined;
  listen<T>(event, handler).then((fn) => (cancelled ? fn() : (unlisten = fn)));
  return () => {
    cancelled = true;
    unlisten?.();
  };
}

// Faixa de mentira só para desenvolver a interface no navegador.
const DEV_MEDIA: Media = {
  app: "dev",
  title: "Noite Aberta",
  artist: "Docky Demo",
  album: "",
  playing: true,
  positionMs: 41_000,
  durationMs: 216_000,
  thumbnail: null,
  shuffle: false,
  repeat: "none",
};
let devPlay = true;
const devPlaying = () => devPlay;
/** O mixer de mentira do navegador. */
const DEV_APPS: AudioApp[] = [
  { id: "spotify", name: "Spotify", icon: null, volume: 0.8, muted: false, active: true },
  { id: "chrome", name: "Google Chrome", icon: null, volume: 1, muted: false, active: false },
  { id: "discord", name: "Discord", icon: null, volume: 0.55, muted: true, active: false },
  { id: "system", name: "Sons do sistema", icon: null, volume: 0.4, muted: false, active: false },
];

/** Ouvinte de evento do navegador, para simular o Rust ao desenvolver a interface sem o Tauri. */
function devListen<T>(name: string, handler: (payload: T) => void): Unlisten {
  const listener = (e: Event) => handler((e as CustomEvent<T>).detail);
  window.addEventListener(name, listener);
  return () => window.removeEventListener(name, listener);
}

const DEV_NOTES: Note[] = [
  { file: "2026-10-31-1000.md", text: "Ver como ficam as letras sincronizadas", modifiedMs: Date.now() - 3_600_000 },
  { file: "2026-10-30-2200.md", text: "Ideia: o mascote reagir quando o build terminar", modifiedMs: Date.now() - 86_400_000 },
  { file: "2026-10-30-1530.md", text: "Comprar cabo USB-C para o notebook", modifiedMs: Date.now() - 90_000_000 },
  { file: "2026-10-29-0900.md", text: "Perguntar sobre o prazo do trabalho final", modifiedMs: Date.now() - 180_000_000 },
  { file: "2026-10-28-1810.md", text: "Rever o resumo da aula de redes", modifiedMs: Date.now() - 260_000_000 },
  { file: "2026-10-27-2040.md", text: "Pagar a conta de internet", modifiedMs: Date.now() - 350_000_000 },
];

const CONFIG_KEY = "docky-config";
let lastRect: Rect = { x: 0, y: 0, w: 0, h: 0 };

export const ipc = {
  async getConfig(): Promise<Config> {
    if (isTauri) return invoke<Config>("get_config");
    try {
      return { ...DEFAULT_CONFIG, ...JSON.parse(localStorage.getItem(CONFIG_KEY) ?? "{}") };
    } catch {
      return DEFAULT_CONFIG;
    }
  },

  async setConfig(config: Config): Promise<Config> {
    if (isTauri) return invoke<Config>("set_config", { config });
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    window.dispatchEvent(new CustomEvent("docky:config", { detail: config }));
    return config;
  },

  onConfig(handler: (config: Config) => void): Unlisten {
    if (isTauri) return subscribe("config-changed", handler);
    const listener = (e: Event) => handler((e as CustomEvent<Config>).detail);
    window.addEventListener("docky:config", listener);
    return () => window.removeEventListener("docky:config", listener);
  },

  /** Informa ao Rust onde a ilha está (alvo da animação), para decidir quando aceitar cliques. */
  setIslandRect(rect: Rect): void {
    lastRect = rect;
    if (isTauri) void invoke("set_island_rect", { rect });
  },

  /** Minimizar ou fechar a janela atual (as configurações não têm moldura própria). */
  async windowControl(action: "minimize" | "close"): Promise<void> {
    if (!isTauri) return window.close();
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const current = getCurrentWindow();
    await (action === "minimize" ? current.minimize() : current.close());
  },

  /** Abre as configurações, já na seção pedida (`atalhos`, `shelf`, `integracoes`…). */
  openSettings(section?: string): void {
    if (isTauri) void invoke("open_settings", { section: section ?? null });
    else window.open(`/?w=settings${section ? `&section=${section}` : ""}`, "docky-settings", "width=780,height=520");
  },

  /** O Rust avisa quando a janela de configurações já estava aberta e deve trocar de seção. */
  onSettingsSection(handler: (section: string) => void): Unlisten {
    return isTauri ? subscribe("settings-section", handler) : () => {};
  },

  /** As telas conectadas. */
  async listMonitors(): Promise<MonitorInfo[]> {
    if (isTauri) return invoke<MonitorInfo[]>("list_monitors");
    return [{ id: "\\.\DISPLAY1", width: 1920, height: 1080, primary: true }];
  },

  /** O Foco é um só, mesmo com a ilha em várias telas: cada janela avisa as outras das suas mudanças. */
  emitTimer(payload: unknown): void {
    if (isTauri) void invoke("plugin:event|emit", { event: "docky-timer", payload });
  },

  onTimer(handler: (payload: unknown) => void): Unlisten {
    return isTauri ? subscribe("docky-timer", handler) : () => {};
  },

  async getPower(): Promise<Power | null> {
    if (isTauri) return invoke<Power | null>("get_power");
    return { hasBattery: true, percent: 82, charging: false, plugged: false };
  },

  onPower(handler: (power: Power) => void): Unlisten {
    if (isTauri) return subscribe("power", handler);
    const listener = (e: Event) => handler((e as CustomEvent<Power>).detail);
    window.addEventListener("docky:power", listener);
    return () => window.removeEventListener("docky:power", listener);
  },

  async getMedia(): Promise<Media | null> {
    if (isTauri) return invoke<Media | null>("get_media");
    return DEV_MEDIA;
  },

  /** `null` quando nenhum app está tocando. */
  onMedia(handler: (media: Media | null) => void): Unlisten {
    if (isTauri) return subscribe("media", handler);
    const listener = (e: Event) => handler((e as CustomEvent<Media | null>).detail);
    window.addEventListener("docky:media", listener);
    return () => window.removeEventListener("docky:media", listener);
  },

  mediaControl(action: MediaAction): void {
    if (isTauri) void invoke("media_control", { action });
    else {
      if (action === "toggle") devPlay = !devPlay;
      if (action.startsWith("shuffle-")) DEV_MEDIA.shuffle = action === "shuffle-on";
      if (action.startsWith("repeat-")) DEV_MEDIA.repeat = action.slice("repeat-".length) as RepeatMode;
      window.dispatchEvent(new CustomEvent("docky:media", { detail: { ...DEV_MEDIA, playing: devPlaying() } }));
    }
  },

  onDownloadDone(handler: (done: DownloadDone) => void): Unlisten {
    return isTauri ? subscribe("download-done", handler) : devListen("docky:download-done", handler);
  },

  revealDownload(path: string): void {
    if (isTauri) void invoke("reveal_download", { path }).catch(() => {});
  },

  async discordState(): Promise<DiscordState> {
    return isTauri ? invoke<DiscordState>("discord_state") : { status: "off", channel: null, muted: false, deafened: false, members: [] };
  },

  onDiscord(handler: (state: DiscordState) => void): Unlisten {
    return isTauri ? subscribe("discord", handler) : devListen("docky:discord", handler);
  },

  async discordSetup(): Promise<DiscordSetup> {
    return isTauri ? invoke<DiscordSetup>("discord_setup") : { secretSaved: false, redirect: "http://127.0.0.1", error: null };
  },

  async discordSaveSecret(secret: string): Promise<void> {
    if (isTauri) await invoke("discord_save_secret", { secret });
  },

  async discordCommand(action: DiscordAction): Promise<void> {
    if (isTauri) await invoke("discord_command", { action });
  },

  /** Hotkeys another program took first ("Ctrl+Alt+D"); Docky keeps trying them in the background. */
  async hotkeysTaken(): Promise<string[]> {
    return isTauri ? invoke<string[]>("hotkeys_taken") : [];
  },

  async currentCall(): Promise<Call | null> {
    return isTauri ? invoke<Call | null>("current_call") : null;
  },

  onCall(handler: (call: Call | null) => void): Unlisten {
    return isTauri ? subscribe("call", handler) : devListen("docky:call", handler);
  },

  async micMuted(): Promise<boolean> {
    return isTauri ? invoke<boolean>("mic_muted") : false;
  },

  setMicMuted(muted: boolean): void {
    if (isTauri) void invoke("set_mic_muted", { muted });
  },

  /** Sound outputs (which one is the default) and the default microphone's mute. */
  async audioState(): Promise<AudioState> {
    if (isTauri) return invoke<AudioState>("audio_state");
    return {
      outputs: [
        { id: "a", name: "Alto-falantes (Realtek(R) Audio)", kind: "speakers", default: devOutput === "a" },
        { id: "b", name: "Fones de ouvido (UGREEN Studio Pro)", kind: "headphones", default: devOutput === "b" },
        { id: "c", name: "5 - H238F165 (AMD High Definition Audio Device)", kind: "display", default: devOutput === "c" },
      ],
      mic: { muted: false },
    };
  },

  /** The default microphone was muted or unmuted, by Docky (Ctrl+Alt+M) or anything else. */
  onMic(handler: (mic: Mic) => void): Unlisten {
    return isTauri ? subscribe("mic", handler) : devListen("docky:mic", handler);
  },

  /** Makes `id` the default output and checks that it stayed. Rejects with a `SwitchError`. */
  async setOutput(id: string): Promise<void> {
    if (isTauri) return invoke<void>("set_output", { id });
    devOutput = id;
  },

  /** Mutes or unmutes the default microphone (the Som page and Ctrl+Alt+M). False without one, or if Windows refused. */
  async setDefaultMicMuted(muted: boolean): Promise<boolean> {
    if (!isTauri) {
      window.dispatchEvent(new CustomEvent("docky:mic", { detail: { muted } }));
      return true;
    }
    return invoke<boolean>("set_default_mic_muted", { muted });
  },

  openSoundSettings(): Promise<void> {
    return isTauri ? invoke<void>("open_sound_settings") : Promise.resolve();
  },

  async reminderList(): Promise<Reminder[]> {
    return isTauri ? invoke<Reminder[]>("reminder_list") : [...devReminders];
  },

  async reminderAdd(text: string, at: number): Promise<Reminder> {
    if (isTauri) return invoke<Reminder>("reminder_add", { text, at });
    const reminder = { id: Date.now(), text, at };
    devReminders = [...devReminders, reminder].sort((a, b) => a.at - b.at);
    devRemindersChanged();
    setTimeout(() => {
      if (!devReminders.some((r) => r.id === reminder.id)) return;
      devReminders = devReminders.filter((r) => r.id !== reminder.id);
      devRemindersChanged();
      window.dispatchEvent(new CustomEvent("docky:reminder", { detail: reminder }));
    }, Math.max(0, at - Date.now()));
    return reminder;
  },

  async reminderCancel(id: number): Promise<void> {
    if (isTauri) return invoke<void>("reminder_cancel", { id });
    devReminders = devReminders.filter((r) => r.id !== id);
    devRemindersChanged();
  },

  /** The pending reminders, whenever the list changes. */
  onReminders(handler: (list: Reminder[]) => void): Unlisten {
    return isTauri ? subscribe("reminders", handler) : devListen("docky:reminders", handler);
  },

  /** A reminder that just came due. */
  onReminder(handler: (reminder: Reminder) => void): Unlisten {
    return isTauri ? subscribe("reminder", handler) : devListen("docky:reminder", handler);
  },

  onBluetoothBattery(handler: (notice: BatteryNotice) => void): Unlisten {
    return isTauri ? subscribe("bt-battery", handler) : devListen("docky:bt-battery", handler);
  },

  onFullscreenSummary(handler: (summary: FullscreenSummary) => void): Unlisten {
    return isTauri ? subscribe("fullscreen-summary", handler) : devListen("docky:fullscreen-summary", handler);
  },

  /** Traz para a frente o app que está tocando (ou abre, se ele não tiver janela). */
  mediaOpenApp(): void {
    if (isTauri) void invoke("media_open_app").catch(() => {});
  },

  async audioApps(): Promise<AudioApp[]> {
    if (isTauri) return invoke<AudioApp[]>("audio_apps");
    return DEV_APPS.map((app) => ({ ...app }));
  },

  setAppVolume(id: string, level: number): void {
    if (isTauri) void invoke("set_app_volume", { id, level });
    else DEV_APPS.forEach((app) => app.id === id && Object.assign(app, { volume: level, muted: false }));
  },

  /** Volume só do app que está tocando (o controle da página Música); null quando ele não tem som aberto. */
  async mediaAppVolume(): Promise<Volume | null> {
    if (isTauri) {
      const found = await invoke<{ volume: number; muted: boolean } | null>("media_app_volume");
      return found && { level: found.volume, muted: found.muted };
    }
    const app = DEV_APPS[0];
    return { level: app.volume, muted: app.muted };
  },

  setMediaAppVolume(level: number): void {
    if (isTauri) void invoke("set_media_app_volume", { level });
    else Object.assign(DEV_APPS[0], { volume: level, muted: false });
  },

  setMediaAppMuted(muted: boolean): void {
    if (isTauri) void invoke("set_media_app_muted", { muted });
    else Object.assign(DEV_APPS[0], { muted });
  },

  setAppMuted(id: string, muted: boolean): void {
    if (isTauri) void invoke("set_app_muted", { id, muted });
    else DEV_APPS.forEach((app) => app.id === id && Object.assign(app, { muted }));
  },

  mediaSeek(positionMs: number): void {
    if (isTauri) void invoke("media_seek", { positionMs });
  },

  onClaudeEvent(handler: (event: ClaudeEvent) => void): Unlisten {
    return isTauri ? subscribe("claude-event", handler) : devListen("docky:claude-event", handler);
  },

  onClaudePermission(handler: (request: PermissionRequest) => void): Unlisten {
    return isTauri ? subscribe("claude-permission", handler) : devListen("docky:claude-permission", handler);
  },

  onClaudePermissionCancel(handler: (id: number) => void): Unlisten {
    return isTauri ? subscribe("claude-permission-cancel", handler) : devListen("docky:claude-cancel", handler);
  },

  claudeDecide(id: number, allow: boolean): void {
    if (isTauri) void invoke("claude_decide", { id, allow });
  },

  async claudeStatus(): Promise<ClaudeStatus> {
    if (isTauri) return invoke<ClaudeStatus>("claude_status");
    return { port: 47831, hooksInstalled: false, settingsPath: "C:\\Users\\você\\.claude\\settings.json" };
  },

  async claudeHooksPlan(): Promise<HooksPlan> {
    if (isTauri) return invoke<HooksPlan>("claude_hooks_plan");
    return {
      settingsPath: "C:\\Users\\você\\.claude\\settings.json",
      backupPath: "C:\\Users\\você\\.claude\\settings.json.docky-backup",
      events: ["SessionStart", "UserPromptSubmit", "PostToolUse", "PermissionRequest", "Stop", "SessionEnd"],
      exampleCommand: 'curl -s -m 590 -X POST -H "Authorization: Bearer ••••••••" … "http://127.0.0.1:47831/hook/PermissionRequest?docky=1" || true',
    };
  },

  claudeHooksInstall(): Promise<void> {
    return isTauri ? invoke<void>("claude_hooks_install") : Promise.resolve();
  },

  claudeHooksRemove(): Promise<void> {
    return isTauri ? invoke<void>("claude_hooks_remove") : Promise.resolve();
  },

  notesSave(stamp: string, text: string): Promise<void> {
    if (isTauri) return invoke<void>("notes_save", { stamp, text });
    DEV_NOTES.unshift({ file: stamp + ".md", text, modifiedMs: Date.now() });
    return Promise.resolve();
  },

  /** Abre a nota no programa padrão dos .md (por exemplo, o Obsidian). */
  notesOpen(file: string): Promise<void> {
    return isTauri ? invoke<void>("notes_open", { file }) : Promise.resolve();
  },

  /** Manda a nota para a Lixeira do Windows. */
  notesDelete(file: string): Promise<void> {
    if (isTauri) return invoke<void>("notes_delete", { file });
    const at = DEV_NOTES.findIndex((n) => n.file === file);
    if (at >= 0) DEV_NOTES.splice(at, 1);
    return Promise.resolve();
  },

  async notesRecent(limit: number): Promise<Note[]> {
    if (isTauri) return invoke<Note[]>("notes_recent", { limit });
    return DEV_NOTES.slice(0, limit);
  },

  async shelfSend(paths: string[], folder: string): Promise<{ sent: number; skipped: number }> {
    if (isTauri) return invoke("shelf_send", { paths, folder });
    return { sent: paths.length, skipped: 0 };
  },

  /** Sends files dropped on the island to the Recycle Bin (they can be restored from there). */
  async shelfTrash(paths: string[]): Promise<{ sent: number; skipped: number }> {
    if (isTauri) return invoke("shelf_trash", { paths });
    return { sent: paths.length, skipped: 0 };
  },

  /** Writes a line to Docky's log file (errors the interface catches). */
  log(level: "error" | "warn" | "info", message: string): void {
    if (isTauri) void invoke("log_write", { level, message }).catch(() => {});
    else console[level === "info" ? "log" : level](`[docky] ${message}`);
  },

  /** A newer release found on GitHub (null: up to date, not checked yet, or the check is off). */
  async updateAvailable(): Promise<{ version: string; url: string } | null> {
    return isTauri ? invoke<{ version: string; url: string } | null>("update_available") : null;
  },

  /** Opens the folder with Docky's log file, to attach it to a bug report. */
  openLogs(): Promise<void> {
    return isTauri ? invoke<void>("open_logs") : Promise.resolve();
  },

  async clipboardHistory(): Promise<ClipItem[]> {
    return isTauri ? invoke<ClipItem[]>("clipboard_history") : devClips;
  },

  onClipboard(handler: (items: ClipItem[]) => void): Unlisten {
    return isTauri ? subscribe("clipboard", handler) : devListen("docky:clipboard", handler);
  },

  /** Puts an older text back on the clipboard; it moves to the top of the history. */
  async clipboardCopy(id: number): Promise<void> {
    if (isTauri) return invoke<void>("clipboard_copy", { id });
    const item = devClips.find((c) => c.id === id);
    if (!item) throw new Error("Esse texto não está mais no histórico");
    devClips = [{ ...item, at: Date.now() }, ...devClips.filter((c) => c.id !== id)];
    devClipsChanged();
  },

  async clipboardRemove(id: number): Promise<void> {
    if (isTauri) return invoke<void>("clipboard_remove", { id });
    devClips = devClips.filter((c) => c.id !== id);
    devClipsChanged();
  },

  async clipboardClear(): Promise<void> {
    if (isTauri) return invoke<void>("clipboard_clear");
    devClips = [];
    devClipsChanged();
  },

  /** How many items the Recycle Bin holds; null when Windows cannot tell. */
  async recycleBinCount(): Promise<number | null> {
    if (isTauri) return invoke<number | null>("recycle_bin_count");
    return 12;
  },

  openRecycleBin(): Promise<void> {
    return isTauri ? invoke<void>("open_recycle_bin") : Promise.resolve();
  },

  async weather(city: string): Promise<Weather> {
    if (isTauri) return invoke<Weather>("weather", { city });
    const hours = Array.from({ length: 12 }, (_, i) => ({ hour: (new Date().getHours() + i) % 24, temp: 24 + Math.round(3 * Math.sin(i / 3)), rain: i === 4 ? 70 : i === 5 ? 85 : i === 6 ? 40 : 5, code: i > 3 && i < 7 ? 61 : 2 }));
    return {
      city, temperature: 24.3, code: 2, max: 27, min: 18, hourly: [24, 26, 27, 25, 22],
      feelsLike: 26, humidity: 71, windKmh: 12, precipitationMm: 0, uvMax: 9, rainMax: 85, sunrise: "05:42", sunset: "18:21", hours,
    };
  },

  /** Arquivos sendo arrastados para a ilha (o Tauri entrega os caminhos). */
  onFileDrop(handler: (event: FileDropEvent) => void): Unlisten {
    if (!isTauri) return devListen("docky:file-drop", handler);
    // `docky://` vem do alvo próprio do Rust (file_drop.rs); `tauri://` é o do wry, que na ilha não chega a registrar.
    const offs = ["tauri://", "docky://"].flatMap((prefix) => [
      subscribe<{ paths: string[] }>(`${prefix}drag-enter`, (p) => handler({ type: "enter", paths: p.paths ?? [] })),
      subscribe<unknown>(`${prefix}drag-leave`, () => handler({ type: "leave", paths: [] })),
      subscribe<{ paths: string[] }>(`${prefix}drag-drop`, (p) => handler({ type: "drop", paths: p.paths ?? [] })),
    ]);
    return () => offs.forEach((off) => off());
  },

  /** Abre o atalho da posição `index` da lista cadastrada nas configurações. */
  launch(index: number): Promise<void> {
    return isTauri ? invoke<void>("launch", { index }) : Promise.resolve();
  },

  /**
   * A imagem (data URL) de um arquivo de ícone. Só vale para um caminho que já é ícone de um atalho ou pasta da Shelf
   * nas configurações; falha se a configuração ainda não foi gravada.
   */
  async iconImage(path: string): Promise<string | null> {
    return isTauri ? invoke<string | null>("icon_image", { path }) : null;
  },

  /** A pasta de ícones em uso (criada se não existir). */
  async iconsFolder(): Promise<string> {
    return isTauri ? invoke<string>("icons_folder") : "C:\\Users\\você\\Documents\\Docky\\icons";
  },

  /** Passa a usar outra pasta de ícones, levando para ela as imagens da pasta atual. Devolve quantas copiou. */
  async setIconsFolder(path: string): Promise<number> {
    return isTauri ? invoke<number>("set_icons_folder", { path }) : 0;
  },

  openIconsFolder(): Promise<void> {
    return isTauri ? invoke<void>("open_icons_folder") : Promise.resolve();
  },

  /**
   * Leva para a pasta de ícones a imagem (ou o ícone do programa) de onde sai o ícone de um app sugerido, e devolve a
   * referência `asset:nome` para pôr no atalho, ou `null` se não deu.
   */
  async adoptIcon(source: string, name: string): Promise<string | null> {
    return isTauri ? invoke<string | null>("adopt_icon", { source, name }) : null;
  },

  /** Procura agora o ícone de todos os atalhos que estão sem. Devolve quantos ganharam. */
  async fetchMissingIcons(): Promise<number> {
    return isTauri ? invoke<number>("fetch_missing_icons") : 0;
  },

  /** Os apps instalados (Menu Iniciar e Área de Trabalho), os mais usados primeiro. */
  async listApps(): Promise<AppEntry[]> {
    if (isTauri) return invoke<AppEntry[]>("list_apps");
    return [
      { name: "Google Chrome", target: "C:\Menu\Google Chrome.lnk", uses: 120, pinned: true, running: true },
      { name: "Spotify", target: "C:\Menu\Spotify.lnk", uses: 80, pinned: false, running: true },
      { name: "Discord", target: "C:\Menu\Discord.lnk", uses: 30, pinned: false, running: false },
      { name: "Obsidian", target: "C:\Menu\Obsidian.lnk", uses: 12, pinned: false, running: false },
      { name: "Steam", target: "C:\Menu\Steam.lnk", uses: 9, pinned: false, running: false },
      { name: "Counter-Strike 2", target: "steam://rungameid/730", uses: 0, pinned: false, running: false, kind: "steam" },
      { name: "Moonlighter", target: "steam://rungameid/606150", uses: 0, pinned: false, running: false, kind: "steam" },
      { name: "Fortnite", target: "com.epicgames.launcher://apps/fn%3Aitem%3AFortnite?action=launch&silent=true", uses: 0, pinned: false, running: false, kind: "epic" },
    ];
  },

  /** Abre o seletor do Windows: uma imagem, um programa/arquivo ou uma pasta. `null` = cancelou. */
  async pickPath(kind: "image" | "app" | "folder"): Promise<string | null> {
    return isTauri ? invoke<string | null>("pick_path", { kind }) : null;
  },

  onHotkey(handler: (key: Hotkey) => void): Unlisten {
    return isTauri ? subscribe("hotkey", handler) : devListen("docky:hotkey", handler);
  },

  /** GET no LRCLIB feito pelo Rust (o site não permite CORS). `null` = 404, sem letra. */
  async lrclib(path: string): Promise<string | null> {
    if (isTauri) return invoke<string | null>("lrclib", { path });
    const response = await fetch(`https://lrclib.net/api/${path}`);
    return response.ok ? response.text() : null;
  },

  /** GET na API pública do NetEase Music (fonte reserva de letras), feito pelo Rust. `null` no navegador (sem CORS). */
  async netease(path: string): Promise<string | null> {
    return isTauri ? invoke<string>("netease", { path }) : null;
  },

  async getVolume(): Promise<Volume | null> {
    if (isTauri) return invoke<Volume | null>("get_volume");
    return { level: 0.62, muted: false };
  },

  onVolume(handler: (volume: Volume) => void): Unlisten {
    if (isTauri) return subscribe("volume", handler);
    const listener = (e: Event) => handler((e as CustomEvent<Volume>).detail);
    window.addEventListener("docky:volume", listener);
    return () => window.removeEventListener("docky:volume", listener);
  },

  setVolume(level: number): void {
    if (isTauri) void invoke("set_volume", { level });
  },

  setMuted(muted: boolean): void {
    if (isTauri) void invoke("set_muted", { muted });
  },

  /** Posição global do cursor, em pixels lógicos relativos à janela da ilha. */
  onCursor(handler: (point: Point) => void): Unlisten {
    if (isTauri) return subscribe("pointer-cursor", handler);
    const listener = (e: PointerEvent) => handler({ x: e.clientX, y: e.clientY });
    window.addEventListener("pointermove", listener);
    return () => window.removeEventListener("pointermove", listener);
  },

  calendarStatus(): Promise<CalendarStatus> {
    return isTauri ? invoke<CalendarStatus>("google_status") : Promise.resolve({ configured: true, connected: true, secretSaved: true });
  },

  /** Guarda (ou apaga, se vazio) o segredo do cliente no Gerenciador de Credenciais. */
  calendarSaveSecret(secret: string): Promise<void> {
    return isTauri ? invoke<void>("google_save_secret", { secret }) : Promise.resolve();
  },

  /** Abre o navegador para o login e espera o retorno (até 3 minutos). */
  calendarConnect(): Promise<void> {
    return isTauri ? invoke<void>("google_connect") : Promise.resolve();
  },

  calendarDisconnect(): Promise<void> {
    return isTauri ? invoke<void>("google_disconnect") : Promise.resolve();
  },

  async calendarEvents(): Promise<CalEvent[]> {
    if (isTauri) return invoke<CalEvent[]>("google_events");
    const now = Date.now();
    return [
      { id: "1", title: "Standup do time", startMs: now + 12 * 60_000, endMs: now + 42 * 60_000, allDay: false, location: null, meetUrl: "https://meet.google.com/abc-defg-hij" },
      { id: "2", title: "Revisão de design", startMs: now + 5 * 3_600_000, endMs: now + 6 * 3_600_000, allDay: false, location: "Sala 2", meetUrl: null },
      { id: "3", title: "Aniversário da Ana", startMs: now + 20 * 3_600_000, endMs: now + 44 * 3_600_000, allDay: true, location: null, meetUrl: null },
    ];
  },

  /** Abre um link https (a entrada de uma videochamada, por exemplo) no navegador. */
  openUrl(url: string): Promise<void> {
    if (isTauri) return invoke<void>("open_meeting", { url });
    window.open(url, "_blank", "noopener");
    return Promise.resolve();
  },

  /** Um clique (do mouse, em qualquer app) começou fora da ilha. */
  onOutsideClick(handler: () => void): Unlisten {
    if (isTauri) return subscribe("island-outside-click", () => handler());
    // No navegador de desenvolvimento: um clique fora do retângulo da ilha.
    const listener = (e: PointerEvent) => {
      const margin = 6;
      const inside =
        e.clientX >= lastRect.x - margin && e.clientX <= lastRect.x + lastRect.w + margin && e.clientY <= lastRect.y + lastRect.h + margin;
      if (!inside) handler();
    };
    window.addEventListener("pointerdown", listener);
    return () => window.removeEventListener("pointerdown", listener);
  },

  /** O cursor entrou ou saiu da área da ilha. */
  onHover(handler: (inside: boolean) => void): Unlisten {
    if (isTauri) return subscribe("island-hover", handler);
    let inside = false;
    const listener = (e: PointerEvent) => {
      const margin = 6;
      const next =
        e.clientX >= lastRect.x - margin &&
        e.clientX <= lastRect.x + lastRect.w + margin &&
        e.clientY <= lastRect.y + lastRect.h + margin;
      if (next !== inside) {
        inside = next;
        handler(inside);
      }
    };
    window.addEventListener("pointermove", listener);
    return () => window.removeEventListener("pointermove", listener);
  },
};

// Só no navegador (desenvolvimento): simula o carregador com `__docky.plug(true)` no console.
if (!isTauri && import.meta.env.DEV) {
  const send = (name: string, detail: unknown) => window.dispatchEvent(new CustomEvent(name, { detail }));
  (globalThis as Record<string, unknown>).__docky = {
    plug(plugged: boolean) {
      send("docky:power", { hasBattery: true, percent: 82, charging: plugged, plugged } satisfies Power);
    },
    /** Simula um evento dos hooks: __docky.claude("UserPromptSubmit") */
    claude(event: string, sessionId = "s1", cwd = "C:\\dev\\docky") {
      send("docky:claude-event", { event, sessionId, cwd, toolName: null } satisfies ClaudeEvent);
    },
    /** Simula um fone Bluetooth conectando: __docky.fone(80) ou, bateria baixa, __docky.fone(15, true) */
    fone(percent = 80, low = false, name = "UGREEN Studio Pro") {
      send("docky:bt-battery", { name, percent, low } satisfies BatteryNotice);
    },
    /** Simula uma tecla global: __docky.hotkey("toggle") */
    hotkey(key: Hotkey = "toggle") {
      send("docky:hotkey", key);
    },
    /** Simula arquivos soltos na ilha: __docky.drop(["C:\a.pdf"]) */
    drop(paths: string[] = ["C:\Users\você\relatorio.pdf", "C:\Users\você\aula-03.pptx"]) {
      send("docky:file-drop", { type: "drop", paths } satisfies FileDropEvent);
    },
    /** Simula um pedido de permissão: __docky.ask("pnpm tauri build") */
    ask(summary = "pnpm tauri build --release", id = Date.now()) {
      send("docky:claude-permission", { id, sessionId: "s1", cwd: "C:\\dev\\docky", toolName: "Bash", summary } satisfies PermissionRequest);
    },
  };
}
