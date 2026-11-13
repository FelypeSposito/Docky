import type { ReactNode } from "react";

interface IconProps {
  size?: number;
  stroke?: number;
}

function Stroke({ size = 18, stroke = 1.7, children }: IconProps & { children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

function Solid({ size = 22, children }: IconProps & { children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export const BoltIcon = ({ size = 11 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M13 2L5 13.5h6L10 22l8-11.5h-6L13 2z" />
  </svg>
);

/** O Claude trabalhando: uma estrela de raios que gira devagar e pulsa (desenho próprio, na cor do Claude). */
export function ClaudeSpinner({ size = 18 }: { size?: number }) {
  return (
    <svg className="cw" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" aria-hidden="true">
      {Array.from({ length: 8 }, (_, i) => (
        <path key={i} className="cw-ray" style={{ animationDelay: `${i * -0.17}s` }} transform={`rotate(${i * 45} 12 12)`} d={i % 2 === 0 ? "M12 3.2v6.2" : "M12 5.4v4"} />
      ))}
    </svg>
  );
}

export const EyeIcon = ({ size = 14, stroke = 1.9, ...p }: IconProps) => (
  <Stroke size={size} stroke={stroke} {...p}>
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </Stroke>
);

export const EyeOffIcon = ({ size = 14, stroke = 1.9, ...p }: IconProps) => (
  <Stroke size={size} stroke={stroke} {...p}>
    <path d="M3 3l18 18M10.6 6.2A9.8 9.8 0 0 1 12 6c6.4 0 10 6 10 6a17 17 0 0 1-3.2 3.9M6.5 7.6A17 17 0 0 0 2 12s3.6 7 10 7a9.6 9.6 0 0 0 4.2-.9" />
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
  </Stroke>
);

export const ListIcon = ({ size = 14, stroke = 1.9, ...p }: IconProps) => (
  <Stroke size={size} stroke={stroke} {...p}>
    <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
  </Stroke>
);

export const PencilIcon = ({ size = 13, stroke = 2, ...p }: IconProps) => (
  <Stroke size={size} stroke={stroke} {...p}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
  </Stroke>
);

export const SlidersIcon = ({ size = 12, stroke = 2, ...p }: IconProps) => (
  <Stroke size={size} stroke={stroke} {...p}>
    <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" />
    <circle cx="16" cy="6" r="2" />
    <circle cx="10" cy="12" r="2" />
    <circle cx="18" cy="18" r="2" />
  </Stroke>
);

export const PinIcon = ({ size = 13, stroke = 2, ...p }: IconProps) => (
  <Stroke size={size} stroke={stroke} {...p}>
    <path d="M12 17v5" />
    <path d="M9 10.8a2 2 0 0 1-1.1 1.8l-1.8.9A2 2 0 0 0 5 15.2V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.8a2 2 0 0 0-1.1-1.8l-1.8-.9A2 2 0 0 1 15 10.8V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
  </Stroke>
);

export const TrashIcon = ({ size = 13, stroke = 2, ...p }: IconProps) => (
  <Stroke size={size} stroke={stroke} {...p}>
    <path d="M3 6h18" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <path d="M10 11v6M14 11v6" />
  </Stroke>
);

export const ExpandIcon = ({ size = 12, stroke = 2, ...p }: IconProps) => (
  <Stroke size={size} stroke={stroke} {...p}>
    <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
  </Stroke>
);

export const ShrinkIcon = ({ size = 12, stroke = 2, ...p }: IconProps) => (
  <Stroke size={size} stroke={stroke} {...p}>
    <path d="M14 10l7-7M10 14l-7 7M4 14h6v6M20 10h-6V4" />
  </Stroke>
);

export const BatteryIcon = (p: IconProps) => (
  <Stroke size={17} stroke={1.8} {...p}>
    <rect x="2.5" y="7" width="16" height="10" rx="3" />
    <path d="M21.5 10.5v3" />
    <rect x="5" y="9.5" width="9" height="5" rx="1.2" fill="currentColor" stroke="none" />
  </Stroke>
);

export const CheckIcon = (p: IconProps) => (
  <Stroke size={12} stroke={3.2} {...p}>
    <path d="M5 12.5l4.5 4.5L19 7" />
  </Stroke>
);

export const BellIcon = (p: IconProps) => (
  <Stroke size={12} stroke={2.4} {...p}>
    <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15L6 16.5zM10 20.5a2.2 2.2 0 0 0 4 0" />
  </Stroke>
);

export const SparkIcon = (p: IconProps) => (
  <Stroke {...p}>
    <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" />
    <path d="M18 16l.8 2.2L21 19l-2.2.8L18 22l-.8-2.2L15 19l2.2-.8L18 16z" />
  </Stroke>
);

export const TimerIcon = (p: IconProps) => (
  <Stroke {...p}>
    <circle cx="12" cy="13.5" r="7.5" />
    <path d="M12 9.5v4l2.5 1.5M9.5 3h5" />
  </Stroke>
);

export const NoteIcon = (p: IconProps) => (
  <Stroke {...p}>
    <path d="M5 20h4L19.5 9.5a2.1 2.1 0 0 0-3-3L6 17v3z" />
    <path d="M14.5 8.5l3 3" />
  </Stroke>
);

export const TrayIcon = (p: IconProps) => (
  <Stroke {...p}>
    <path d="M4 14l2-8h12l2 8M4 14v5h16v-5M4 14h4.5l1 2h5l1-2H20" />
  </Stroke>
);

export const CalendarIcon = (p: IconProps) => (
  <Stroke {...p}>
    <rect x="4" y="5" width="16" height="15" rx="3.5" />
    <path d="M4 10h16M9 3v4M15 3v4" />
  </Stroke>
);

export const FolderIcon = (p: IconProps) => (
  <Stroke size={15} stroke={1.9} {...p}>
    <path d="M3.5 7.5a2 2 0 0 1 2-2H9l2 2.5h7.5a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />
  </Stroke>
);

export const FileIcon = (p: IconProps) => (
  <Stroke size={13} {...p}>
    <path d="M7 3h7l4 4v14H7z" />
    <path d="M14 3v4h4" />
  </Stroke>
);

/** Ícone do tempo a partir do código WMO do Open-Meteo. */
export function WeatherIcon({ code, size = 22 }: { code: number; size?: number }) {
  const sun = <circle cx="12" cy="12" r="4" />;
  const rays = <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4" />;
  const cloud = <path d="M7 18a4 4 0 1 1 .8-7.9A5.5 5.5 0 0 1 18.5 11a3.5 3.5 0 0 1-.5 7z" />;
  if (code <= 1)
    return (
      <Stroke size={size} stroke={1.8}>
        {sun}
        {rays}
      </Stroke>
    );
  if (code >= 95)
    return (
      <Stroke size={size} stroke={1.8}>
        {cloud}
        <path d="M12.5 14l-2 3.5h3l-2 3.5" />
      </Stroke>
    );
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82))
    return (
      <Stroke size={size} stroke={1.8}>
        {cloud}
        <path d="M9 20l.8-2M13 20l.8-2M17 20l.8-2" />
      </Stroke>
    );
  if ((code >= 71 && code <= 77) || code >= 85)
    return (
      <Stroke size={size} stroke={1.8}>
        {cloud}
        <path d="M9 19.5h.01M13 20.5h.01M17 19.5h.01" />
      </Stroke>
    );
  return (
    <Stroke size={size} stroke={1.8}>
      {cloud}
    </Stroke>
  );
}

export const PulseIcon = (p: IconProps) => (
  <Stroke {...p}>
    <path d="M3 12h4l2.5-6.5 4.5 13 2.5-6.5H21" />
  </Stroke>
);

export const GridIcon = (p: IconProps) => (
  <Stroke {...p}>
    <rect x="4" y="4" width="7" height="7" rx="2" />
    <rect x="13" y="4" width="7" height="7" rx="2" />
    <rect x="4" y="13" width="7" height="7" rx="2" />
    <rect x="13" y="13" width="7" height="7" rx="2" />
  </Stroke>
);

export const SearchIcon = (p: IconProps) => (
  <Stroke size={16} {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16l4 4" />
  </Stroke>
);

export const SunIcon = (p: IconProps) => (
  <Stroke {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4" />
  </Stroke>
);

export const CloudIcon = (p: IconProps) => (
  <Stroke {...p}>
    <path d="M7 18a4 4 0 1 1 .8-7.9A5.5 5.5 0 0 1 18.5 11a3.5 3.5 0 0 1-.5 7z" />
  </Stroke>
);

export const KeyboardIcon = (p: IconProps) => (
  <Stroke {...p}>
    <rect x="3" y="6" width="18" height="12" rx="3" />
    <path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10" />
  </Stroke>
);

export const ArrowUpIcon = (p: IconProps) => (
  <Stroke size={14} stroke={2.2} {...p}>
    <path d="M6 14l6-6 6 6" />
  </Stroke>
);

export const ArrowDownIcon = (p: IconProps) => (
  <Stroke size={14} stroke={2.2} {...p}>
    <path d="M6 10l6 6 6-6" />
  </Stroke>
);

/** Seis pontinhos: a alça para arrastar. */
export const GripIcon = (p: IconProps) => (
  <svg width={p.size ?? 16} height={p.size ?? 16} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <circle cx="9" cy="6" r="1.7" />
    <circle cx="15" cy="6" r="1.7" />
    <circle cx="9" cy="12" r="1.7" />
    <circle cx="15" cy="12" r="1.7" />
    <circle cx="9" cy="18" r="1.7" />
    <circle cx="15" cy="18" r="1.7" />
  </svg>
);

export const GearIcon = (p: IconProps) => (
  <Stroke size={16} stroke={1.8} {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </Stroke>
);

export const MusicIcon = (p: IconProps) => (
  <Stroke {...p}>
    <path d="M9 18V6l10-2v12" />
    <circle cx="6.5" cy="18" r="2.5" />
    <circle cx="16.5" cy="16" r="2.5" />
  </Stroke>
);

export const LyricsIcon = (p: IconProps) => (
  <Stroke size={20} {...p}>
    <path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-6l-4.5 3.5V17H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" />
    <path d="M8 10h8M8 13h5" />
  </Stroke>
);

export const VolumeIcon = ({ level = 1, muted = false, ...p }: IconProps & { level?: number; muted?: boolean }) => (
  <Stroke size={19} {...p}>
    <path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z" />
    {muted ? (
      <path d="M16 9.5l4 5M20 9.5l-4 5" />
    ) : (
      <>
        {level > 0 && <path d="M15.5 9a4 4 0 0 1 0 6" />}
        {level > 0.5 && <path d="M18 6.5a7.5 7.5 0 0 1 0 11" />}
      </>
    )}
  </Stroke>
);

export const PrevIcon = (p: IconProps) => (
  <Solid size={24} {...p}>
    <path d="M11.5 7v10L4 12zM20 7v10l-7.5-5z" />
  </Solid>
);
export const NextIcon = (p: IconProps) => (
  <Solid size={24} {...p}>
    <path d="M12.5 7v10L20 12zM4 7v10l7.5-5z" />
  </Solid>
);
export const PlayIcon = (p: IconProps) => (
  <Solid size={30} {...p}>
    <path d="M8 5.6v12.8a1 1 0 0 0 1.5.86l10.4-6.4a1 1 0 0 0 0-1.72L9.5 4.74A1 1 0 0 0 8 5.6z" />
  </Solid>
);
export const PauseIcon = (p: IconProps) => (
  <Solid size={30} {...p}>
    <rect x="6.5" y="5" width="4" height="14" rx="1.4" />
    <rect x="13.5" y="5" width="4" height="14" rx="1.4" />
  </Solid>
);

export const ChevronLeftIcon = (p: IconProps) => (
  <Stroke size={15} stroke={2.2} {...p}>
    <path d="M14.5 6l-6 6 6 6" />
  </Stroke>
);
export const ChevronRightIcon = (p: IconProps) => (
  <Stroke size={15} stroke={2.2} {...p}>
    <path d="M9.5 6l6 6-6 6" />
  </Stroke>
);

/** As quatro barrinhas que mexem quando há música tocando. */
export function Equalizer({ playing }: { playing: boolean }) {
  return (
    <div className={`eq${playing ? " play" : ""}`} aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
    </div>
  );
}
