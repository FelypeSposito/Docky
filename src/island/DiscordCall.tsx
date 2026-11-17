import { useEffect, useState } from "react";
import type { DiscordState } from "../lib/ipc";
import { ipc } from "../lib/ipc";
import { formatElapsed } from "./activity";
import { HeadphonesIcon, HeadphonesOffIcon, MicIcon, MicOffIcon, PhoneOffIcon } from "./icons";
import { t } from "../i18n";

const MAX_FACES = 6;

/** Initials for a member's circle: "Ana Paula" → "AP", "felype" → "F". */
export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("") || "?";

/** Mute, deafen and leave: Discord's own buttons (only Discord, not the whole PC). */
export function DiscordButtons({ discord, size = "md" }: { discord: DiscordState; size?: "sm" | "md" }) {
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  return (
    <span className={`dc-btns${size === "sm" ? " mini" : ""}`} onClick={stop}>
      <button
        className={discord.muted ? "on" : ""}
        aria-label={t(discord.muted ? "Ativar o microfone no Discord" : "Mutar no Discord")}
        aria-pressed={discord.muted}
        onClick={() => ipc.discordCommand(discord.muted ? "unmute" : "mute")}
      >
        {discord.muted ? <MicOffIcon /> : <MicIcon />}
      </button>
      <button
        className={discord.deafened ? "on" : ""}
        aria-label={t(discord.deafened ? "Voltar a ouvir no Discord" : "Ensurdecer no Discord")}
        aria-pressed={discord.deafened}
        onClick={() => ipc.discordCommand(discord.deafened ? "undeafen" : "deafen")}
      >
        {discord.deafened ? <HeadphonesOffIcon /> : <HeadphonesIcon />}
      </button>
      {size === "md" && (
        <button className="leave" aria-label={t("Sair da chamada")} onClick={() => ipc.discordCommand("leave")}>
          <PhoneOffIcon />
        </button>
      )}
    </span>
  );
}

/** Who is in the call: a circle per person, lit while they talk, crossed when muted. */
export function DiscordFaces({ discord }: { discord: DiscordState }) {
  const shown = discord.members.slice(0, MAX_FACES);
  const rest = discord.members.length - shown.length;
  return (
    <span className="dc-faces">
      {shown.map((m) => (
        <i key={m.id} className={`dc-face${m.speaking ? " talk" : ""}${m.muted ? " mute" : ""}`} title={m.name}>
          {initials(m.name)}
        </i>
      ))}
      {rest > 0 && <i className="dc-face more">+{rest}</i>}
    </span>
  );
}

/** "04:12" since `since` (Unix ms), ticking every second; null without a start. */
export function useElapsed(since: number | null): string | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (since === null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [since]);
  return since === null ? null : formatElapsed((now - since) / 1000);
}

/** The call as a block: the channel and who is talking on top, the faces and the buttons below. */
export function DiscordCall({ discord, since }: { discord: DiscordState; since: number | null }) {
  const elapsed = useElapsed(since);
  const talking = discord.members.filter((m) => m.speaking).map((m) => m.name);
  return (
    <div className="dc">
      <div className="dc-top">
        <b>{discord.channel}</b>
        <span className="dc-sub">{talking.length > 0 ? `${talking.join(", ")} falando` : `${discord.members.length} na chamada`}</span>
        {elapsed && <em>{elapsed}</em>}
      </div>
      <div className="dc-row">
        <DiscordFaces discord={discord} />
        <DiscordButtons discord={discord} />
      </div>
    </div>
  );
}
