import type { ClaudeEvent, PermissionRequest } from "../claude/sessions";
import type { CalEvent } from "../calendar/events";
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
}

export interface Volume {
  /** 0 a 1 */
  level: number;
  muted: boolean;
}

export type MediaAction = "toggle" | "next" | "previous";

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

export interface SystemStats {
  /** 0 a 100 */
  cpu: number;
  /** Frequência atual do processador, em MHz */
  cpuMhz: number;
  memoryUsed: number;
  memoryTotal: number;
  /** Uso da GPU em % (0 a 100); null se o Windows não expõe o contador */
  gpu: number | null;
  /** Memória dedicada da GPU em uso, em bytes */
  gpuMemoryUsed: number | null;
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
  const { listen } = await import("@tauri-apps/api/event");
  return listen<T>(event, (e) => handler(e.payload));
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
};
let devPlay = true;
const devPlaying = () => devPlay;

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

  openSettings(): void {
    if (isTauri) void invoke("open_settings");
    else window.open("/?w=settings", "docky-settings", "width=780,height=520");
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
      window.dispatchEvent(new CustomEvent("docky:media", { detail: { ...DEV_MEDIA, playing: devPlaying() } }));
    }
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

  async weather(city: string): Promise<Weather> {
    if (isTauri) return invoke<Weather>("weather", { city });
    return { city, temperature: 24.3, code: 2, max: 27, min: 18, hourly: [24, 26, 27, 25, 22] };
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

  async systemStats(): Promise<SystemStats> {
    if (isTauri) return invoke<SystemStats>("system_stats");
    const wobble = (base: number, spread: number) => base + Math.random() * spread;
    return { cpu: wobble(15, 30), cpuMhz: 4600, memoryUsed: wobble(7.6, 1) * 1e9, memoryTotal: 16e9, gpu: wobble(10, 40), gpuMemoryUsed: wobble(1.5, 1) * 1e9 };
  },

  /** Abre o atalho da posição `index` da lista cadastrada nas configurações. */
  launch(index: number): Promise<void> {
    return isTauri ? invoke<void>("launch", { index }) : Promise.resolve();
  },

  /** A imagem do ícone do atalho da posição `index` (data URL), ou `null` se o ícone for texto ou estiver vazio. */
  async shortcutIcon(index: number): Promise<string | null> {
    return isTauri ? invoke<string | null>("shortcut_icon", { index }) : null;
  },

  /** Abre o seletor de arquivo do Windows para escolher uma imagem. `null` = cancelou. */
  async pickImage(): Promise<string | null> {
    return isTauri ? invoke<string | null>("pick_image") : null;
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
