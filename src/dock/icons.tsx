import type { DockApp } from "../lib/ipc";

/** The dock's own glyphs, drawn on a 24 grid in one stroke weight (the island's icons are the same family). */

type Side = "bottom" | "left" | "right";

const Stroke = ({ children, size = 16, style }: { children: React.ReactNode; size?: number; style?: React.CSSProperties }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}>
    {children}
  </svg>
);

/** Four small squares: the Start menu. */
export const StartIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
    {[
      [3, 3],
      [13, 3],
      [3, 13],
      [13, 13],
    ].map(([x, y]) => (
      <rect key={`${x}-${y}`} x={x} y={y} width="8" height="8" rx="2.2" fill="currentColor" />
    ))}
  </svg>
);

export const SearchIcon = () => (
  <Stroke>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="M15.5 15.5L20 20" />
  </Stroke>
);

/** Two windows, one behind the other: Task View. */
export const TaskViewIcon = () => (
  <Stroke>
    <rect x="3" y="7" width="13" height="12" rx="2.5" />
    <path d="M8 4h10.5A2.5 2.5 0 0 1 21 6.5V15" />
  </Stroke>
);

/** Three sliders: Windows' quick settings (Wi-Fi, Bluetooth, brightness…). */
export const QuickIcon = () => (
  <Stroke>
    <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
    <circle cx="15" cy="7" r="2" />
    <circle cx="9" cy="17" r="2" />
  </Stroke>
);

/** An arrow toward the open screen: Windows' taskbar for a moment, to reach the tray icons. */
export const TrayUpIcon = ({ side }: { side: Side }) => (
  <Stroke size={15} style={{ rotate: side === "left" ? "90deg" : side === "right" ? "-90deg" : "0deg" }}>
    <path d="M6 15l6-6 6 6" />
  </Stroke>
);

export const NewWindowIcon = () => (
  <Stroke size={15}>
    <rect x="3.5" y="3.5" width="17" height="17" rx="3.5" />
    <path d="M12 8.5v7M8.5 12h7" />
  </Stroke>
);

export const FolderIcon = () => (
  <Stroke size={15}>
    <path d="M3.5 7.5A2 2 0 0 1 5.5 5.5h4l2 2.5h7a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />
  </Stroke>
);

export const PinIcon = ({ off }: { off?: boolean }) => (
  <Stroke size={15}>
    <path d="M9 4h6l-1 5 3.5 3.5v1.5h-11V12.5L10 9z" />
    <path d="M12 14v6" />
    {off && <path d="M4 4l16 16" />}
  </Stroke>
);

export const CloseIcon = ({ size = 15 }: { size?: number }) => (
  <Stroke size={size}>
    <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
  </Stroke>
);

export const GaugeIcon = () => (
  <Stroke size={15}>
    <path d="M4 18a8 8 0 1 1 16 0" />
    <path d="M12 18l3.5-5" />
  </Stroke>
);

export const DesktopIcon = () => (
  <Stroke size={15}>
    <rect x="3" y="4.5" width="18" height="12" rx="2.5" />
    <path d="M9 20h6M12 16.5V20" />
  </Stroke>
);

export const GearIcon = () => (
  <Stroke size={15}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" />
  </Stroke>
);

/** An app's icon, or its first letter on a quiet square when it has none. */
export function AppIcon({ app, size }: { app: DockApp; size: number }) {
  if (app.icon) return <img className="td-img" src={app.icon} alt="" width={size} height={size} draggable={false} />;
  return (
    <span className="td-letter" style={{ width: size, height: size, fontSize: size * 0.42 }}>
      {(app.name.trim()[0] ?? "?").toUpperCase()}
    </span>
  );
}
