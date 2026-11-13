# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

(Tauri 2 desktop app whose interface is a webview: React + TypeScript. Runs on Windows 11 today; a macOS version is
planned for later, not started.)

## Users

Many people, not only the author: anyone who finds the public GitHub repository, installs the Windows build and uses
Docky every day for work, study and games. The author also uses it daily and will show the project on LinkedIn as a
portfolio piece, so first impression and first use matter as much as long-term use.

## Product Purpose

Docky is a "dynamic island" for Windows 11: a black pill at the top center of the screen that shows the time, the
music playing with synced lyrics, what Claude Code is doing (and lets you approve it), timers, notes, the Shelf (drop
files into folders), calendar and weather, app/game shortcuts and system usage. It grows when you hover and goes back to
a pill when you leave. Success: it is useful the moment it is installed and stays out of the way.

## Positioning

A living island on the desktop with a personality of its own: the eyes that follow the cursor, blink, sleep and react
(wide when something happens, scanning while Claude works, shaking the head when you deny). Built around the author's
real workflow (Claude Code approvals, lyrics, shortcuts to apps and games), with everything kept on the computer.

## Operating Context

Lives always-on-top at the screen edge, on one or more monitors; hidden when a game or video is fullscreen. Settings
open in a separate window from the tray or the island's gear. Integrations: Claude Code (local hooks), Google Calendar
(optional, read-only, user-created OAuth client), LRCLIB/NetEase lyrics, Open-Meteo weather, Steam/Epic/Start Menu for
shortcut suggestions (only after the person allows it), automatic shortcut icons.

## Capabilities and Constraints

- Pages: Música, Foco, Notas, Shelf, Agenda, Atalhos, Sistema, Claude; each can have a larger view and quick settings.
- Shortcuts: apps, games, folders, sites, groups, custom sections, suggestions, icons that fill themselves in.
- Privacy is a feature: no server, account or telemetry; network requests are listed in PRIVACY.md and local scans
  wait for an explicit "Permitir".
- Interface language: Brazilian Portuguese.
- Undecided: a macOS port (later); making the island's character customizable (see Brand Commitments).

## Brand Commitments

- **The eyes stay**, but the character should become customizable later (other pupils, no eyes, a thermometer or
  other widget in their place). Not part of the current work; do not hard-wire the eyes as the only option.
- **Black + pink/purple glow**: the island is pure black; the ambient glow is pink → purple (#FF5C7A → #7A3CFF) by
  default and takes the album colour when music plays.
- **Light, direct Portuguese**: short sentences, like a person talking; no jargon.
- **Inter** is the typeface.

## Evidence on Hand

- Approved visual and motion prototype: `prototype/docky-visual-v2-PROTOTYPE.html` (kept on a separate branch).
- Motion and design brief: `docs/MOTION-BRIEF.md`. App icon: `src-tauri/icons/source.png` (the eyes).
- Release v0.1.0 on GitHub with the Windows installer. No testimonials, user counts or press exist; do not invent them.

## Product Principles

1. **Good with little configuration.** Docky should work well right after install; settings show first what changes
   daily life and tuck the rest away. The author's main complaint is "too many boring settings".
2. **Out of the way, never in the way.** It lives at the edge of the screen; every addition must earn its space.
3. **Personality with restraint.** The eyes and the glow carry the character; the rest of the interface stays calm.
4. **Everything stays on the computer** unless the person chose otherwise, and the app says so plainly.
5. **Made to be shown.** It is a public portfolio piece: every screen should hold up to a first look.
