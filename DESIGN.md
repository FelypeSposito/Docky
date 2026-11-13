---
name: Docky
description: A living black island at the top of the Windows desktop, with eyes, a low pink-to-purple glow and calm Portuguese controls.
colors:
  glow-pink: "#ff5c7a"
  glow-purple: "#7a3cff"
  island-black: "#000000"
  window-ground: "#050506"
  rail-lift: "#0b0b0d"
  stage-black: "#09090b"
  popover: "#141417"
  ink: "#ffffff"
  ink2: "rgba(255, 255, 255, 0.62)"
  ink3: "rgba(255, 255, 255, 0.5)"
  block: "rgba(255, 255, 255, 0.065)"
  field: "rgba(255, 255, 255, 0.07)"
  fill: "rgba(255, 255, 255, 0.085)"
  control: "rgba(255, 255, 255, 0.12)"
  track: "rgba(255, 255, 255, 0.18)"
  hairline: "rgba(255, 255, 255, 0.07)"
  on-accent: "#1a0207"
  break-green: "#3dd68c"
  custom-violet: "#a98bff"
  alarm-red: "#ff3b4e"
  claude-clay: "#e8825a"
  danger: "#e5484d"
  success: "#4be37a"
typography:
  display:
    fontFamily: "Inter, Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 650
    letterSpacing: "-0.03em"
  numeral:
    fontFamily: "Inter, Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "27px"
    fontWeight: 650
    letterSpacing: "-0.03em"
    fontFeature: "tnum"
  title:
    fontFamily: "Inter, Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "13.5px"
    fontWeight: 600
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Inter, Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.35
    letterSpacing: "-0.006em"
  hint:
    fontFamily: "Inter, Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "Inter, Segoe UI Variable Text, Segoe UI, system-ui, sans-serif"
    fontSize: "11.5px"
    fontWeight: 600
rounded:
  island: "18px"
  stage: "18px"
  block: "16px"
  window: "14px"
  launcher-tile: "14px"
  dock: "12px"
  field: "10px"
  icon: "10px"
  control: "9px"
  chip: "13px"
  round: "999px"
spacing:
  hair: "2px"
  xs: "4px"
  sm: "6px"
  md: "8px"
  lg: "12px"
  xl: "14px"
  section: "26px"
  column: "36px"
components:
  header-field:
    backgroundColor: "{colors.field}"
    textColor: "{colors.ink3}"
    typography: "{typography.body}"
    rounded: "{rounded.field}"
    height: "30px"
    padding: "0 6px 0 10px"
  settings-search-field:
    backgroundColor: "{colors.field}"
    textColor: "{colors.ink3}"
    rounded: "{rounded.field}"
    height: "34px"
    padding: "0 11px"
  block:
    backgroundColor: "{colors.block}"
    rounded: "{rounded.block}"
  launcher-tile:
    textColor: "{colors.ink}"
    rounded: "{rounded.launcher-tile}"
    height: "62px"
    padding: "0 8px"
  dock:
    backgroundColor: "{colors.block}"
    rounded: "{rounded.dock}"
    height: "36px"
    padding: "3px"
  dock-item:
    textColor: "{colors.ink2}"
    rounded: "{rounded.control}"
    height: "30px"
    padding: "0 8px"
  dock-item-active:
    textColor: "{colors.glow-pink}"
    rounded: "{rounded.control}"
  row:
    textColor: "{colors.ink}"
    typography: "{typography.title}"
    height: "56px"
    padding: "10px 2px"
  quick-row:
    typography: "{typography.title}"
    height: "44px"
    padding: "6px 2px"
  toggle:
    backgroundColor: "{colors.track}"
    rounded: "{rounded.chip}"
    width: "42px"
    height: "26px"
  toggle-on:
    backgroundColor: "{colors.glow-pink}"
  toggle-compact:
    backgroundColor: "{colors.track}"
    width: "38px"
    height: "22px"
  button:
    backgroundColor: "{colors.control}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "32px"
    padding: "0 14px"
  button-primary:
    backgroundColor: "{colors.glow-pink}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.control}"
    height: "32px"
    padding: "0 14px"
  chip:
    backgroundColor: "{colors.field}"
    textColor: "{colors.ink2}"
    typography: "{typography.label}"
    rounded: "{rounded.chip}"
    height: "26px"
    padding: "0 11px"
  chip-active:
    backgroundColor: "{colors.glow-pink}"
    textColor: "{colors.on-accent}"
  nav-item:
    textColor: "{colors.ink2}"
    rounded: "{rounded.control}"
    height: "34px"
    padding: "0 10px"
  timer-chip:
    textColor: "{colors.glow-pink}"
    rounded: "11px"
    height: "22px"
    padding: "0 8px 0 4px"
  alarm-icon:
    backgroundColor: "{colors.alarm-red}"
    textColor: "{colors.ink}"
    rounded: "{rounded.round}"
    size: "20px"
---

# Design System: Docky

## Overview

**Creative North Star: "The Black Island"**

Docky is a piece of pure black hung from the top edge of the screen, with a face. Everything else is borrowed from that object: the Settings window is the island's own world held to a working pace, near-black instead of black, with a rail one shade lifted from the ground. The character lives in two places only, the eyes and the glow; the rest is calm, flat and quiet so the character can be seen.

Surfaces are flat. Depth comes from tone (one step of white over black) and from a single lit edge whose light grows from top to bottom, as if the island caught the desk light under it. Options sit on hairlines, not in boxes. One accent colour marks whatever is active, and in the island that colour is not fixed: it is pulled from the album cover while music plays and falls back to the brand pink.

Density is compact and Windows-native in scale (13px body, 30 to 34px controls), with Inter throughout, tabular numerals for every clock, counter and timer, and sentence-case Portuguese labels.

**Key Characteristics:**
- Pure black island, near-black settings window; no light theme.
- Flat blocks one tone above black with a 1px inner edge.
- One accent (default #FF5C7A, album-driven in the island) reserved for the active, selected, focused or primary thing.
- Pink-to-purple glow kept low: behind the island's bottom edge and behind the Settings preview stage, nowhere else.
- Rows on hairlines instead of boxed cards.
- Inter, tabular numerals, sentence case.
- Motion with one long, soft-landing ease; everything has a reduced-motion fallback.

## Colors

Black and white with one live accent and a small set of functional state hues.

### Primary
- **Glow Pink** (glow-pink): the accent. Active dock page, selected rail item, focused field ring, caret, toggles on, primary buttons, the first search match, the equalizer bars. In the island it is exposed as `--accent` and replaced by the album colour (`pickAccent`: hue of the most saturated pixels, lightness clamped 52 to 66%) while music plays; it eases between colours over 0.9s.

### Secondary
- **Glow Purple** (glow-purple): the second stop of the ambient glow only (`--glow2`). Never a text, fill or control colour. Follows the album too (accent hue + 48°).

### Tertiary (functional, mode-scoped)
- **Break Green** (break-green): the Foco timer in short and long break modes (ring, timer chip, chip-on, start button).
- **Custom Violet** (custom-violet): the free-running custom timer.
- **Alarm Red** (alarm-red): the end of a timer only. The island's lit edge turns red and pulses four times.
- **Claude Clay** (claude-clay): Claude Code working spinner and badge; the integration's own colour.
- **Danger** (danger) and **Success** (success): close-window hover, destructive icon hovers, the connected badge.

### Neutral
- **Island Black** (island-black): the island body and the preview's mini island. Pure black, always.
- **Window Ground** (window-ground): the Settings window background.
- **Rail Lift** (rail-lift): the Settings rail, one shade above the ground, separated by a hairline on its right.
- **Stage Black** (stage-black): the Settings preview stage that holds the miniature island over the glow.
- **Popover** (popover): search results dropdown and other floating lists.
- **Ink / Ink 2 / Ink 3** (ink, ink2, ink3): primary text; secondary text (dates, values, inactive nav); hints, placeholders and group titles. Ink 3 is held at 0.5 alpha wherever small text is read.
- **Block / Field / Fill / Control / Track** (block, field, fill, control, track): the white-over-black ladder. Blocks and the dock at ~0.06; fields and chips at 0.07; small fills at 0.085; buttons and selected sub-tabs at 0.12; toggle and slider tracks at 0.18. Hover moves a surface one step up the ladder.
- **Hairline** (hairline): row separators and the rail edge.

### Named Rules
**The One Pink Rule.** The accent marks what is active, selected, focused or primary, and nothing else. If an element is pink and you cannot say which of those four it is, it is wrong.

**The Album Owns The Accent Rule.** Inside the island every accent use goes through `var(--accent, #ff5c7a)` so the cover colour can take over. Never hard-code the pink in island components.

**The Glow Stays Low Rule.** The pink-to-purple glow is a blurred, masked pair of radial gradients that rises from below: behind the island's bottom edge (opacity at most 0.62 × the user's glow strength) and behind the Settings preview stage. It never sits behind text blocks, rows or controls.

## Typography

**Display Font:** Inter (with Segoe UI Variable Text, Segoe UI, system-ui)
**Body Font:** Inter (same stack)
**Label/Mono Font:** JetBrains Mono only for code and paths inside the Claude Code setup plan.

**Character:** one family, carried by weight (500 to 700, with 550 and 650 steps) and slight negative tracking rather than by size jumps. Numbers are always tabular.

### Hierarchy
- **Display** (650, 24px, -0.03em): the area title in Settings. One per view.
- **Numeral** (650, 27px, -0.03em, tabular): timer ring, big stats (22px variant), agenda day.
- **Title** (600, 13.5px, -0.01em): row labels in Settings; 12.5px in the island's quick settings; launcher tile names at 12px.
- **Body** (400, 13px/1.35, -0.006em): the base. Pill text and header text sit at 13px, 550 to 650 weight. The time is 650 tabular, the date 500 in Ink 2.
- **Hint** (400, 12px/1.45, Ink 3): row descriptions, group titles (600), notes under groups.
- **Label** (600, 11.5px): chips, small links, "+N atalhos" line, dock labels (12px).

### Named Rules
**The Tabular Clock Rule.** Every time, countdown, count and percentage uses tabular numerals so the island never jitters as numbers change.

**The Sentence Case Rule.** Labels, group titles and buttons are sentence case. Group titles are 12px 600 in Ink 3, not uppercase and not letter-spaced.

## Layout

**The island.** A notch hung at top centre with concave 16px ears joining it to the screen edge. The pill is 36px tall; the opened island has a 48px header row (eyes at left, page field filling the middle, date and time, small actions), a fixed-height body inset 34px each side (148px default, `--body-h`), and the dock floating 10px above the bottom edge. Nothing overflows the body: blocks shrink, lists scroll. Pages lay out as bento grids with 8px gaps; the Atalhos page is a 4 × 2 grid of 62px tiles at 6px gaps with one quiet "+N atalhos" line below.

**Settings.** A 240px rail and a fluid pane. The pane has a 44px drag strip with window controls, then a content column capped at 760px and centred, padded 36px at the sides. Each area opens under a 168px preview stage, then a 24px title, a one-line lead, and option groups spaced 26px apart. Below 860px wide the rail collapses to 64px icons only; below 620px tall the stage shrinks to 120px.

**Rhythm.** 2 / 4 / 6 / 8 / 12 / 14 px inside components; 18 and 26px between blocks of content; 36px column gutters.

**The Header Is The Field Rule.** In the opened island the active page's input (search in Atalhos, quick note in Notas) lives in the header row, portalled into one slot; typing any letter focuses it. Pages do not add a second search or input row in the body.

## Elevation & Depth

Flat by default, with tonal layering and one lit edge. Shadows appear only on things that genuinely float above the surface (dropdowns, a dragged row, the island itself over the desktop).

### Shadow Vocabulary
- **Lit edge** (1px masked border, `linear-gradient(180deg, transparent → rgba(255,255,255,.07) 45% → rgba(255,255,255,.2))`): the island's edge; the Settings window uses the same device at 0.05 → 0.16. Light grows downward.
- **Inner edge** (`box-shadow: inset 0 0 0 1px rgba(255,255,255,.055)`): every flat block, the dock, the preview stage.
- **Hairline** (`box-shadow: inset 0 -1px 0 rgba(255,255,255,.07)`): rows.
- **Popover** (`0 18px 40px rgba(0,0,0,.6), inset 0 0 0 1px rgba(255,255,255,.08)`): search results.
- **Lifted while dragging** (`0 10px 28px rgba(0,0,0,.55)`): a row or dock item being reordered.
- **Island cast** (`0 22px 50px rgba(0,0,0,var(--shadow))`): the island over the desktop.

### Named Rules
**The Light Grows Downward Rule.** The island and the window share one edge: a 1px masked gradient, dim at the top, brightest at the bottom. This edge gradient is the world's own device and is allowed; gradient fills on blocks are not.

**The Flat Block Rule.** A block is one flat tone of white over black plus a 1px inner edge. No vertical glass gradients, no backdrop blur, no hard offset shadows.

## Shapes

Soft, rounded rectangles scaled to their size, never sharp corners. The island is a bottom-rounded slab (18px) with concave ears; the Settings window is 14px all round; blocks and the preview stage 16 to 18px; launcher tiles 14px; dock 12px; fields and icon squares 10px; buttons, nav items and dock items 9px; chips and toggles are full capsules (radius half the height). Shortcut icons sit in 10px rounded squares; letter fallbacks get a 0.12 white square. Dashed borders appear only on drop targets (Shelf).

## Components

### Header Field (island) / Search Field (Settings)
Quiet until used.
- **Style:** Field fill, 10px radius, magnifier or page icon in Ink 3 at 14px, 13px 500 input text in Ink, placeholder in Ink 3. 30px tall in the island header, 34px in the Settings rail.
- **Focus:** fill steps up to 0.09 to 0.10, a 1.5px inset accent ring (island at 75% accent), icon turns Ink 2, caret and selection in the accent. An "Enter" keycap (10.5px, 5px radius, 0.07 fill) appears once there is text. Esc with text clears; empty Esc lets the island close.

### Blocks
- **Corner Style:** 16px.
- **Background:** Block (0.065) with a 1px inner edge.
- **Shadow Strategy:** none; see Elevation.
- **Internal Padding:** 8 to 14px; content shrinks rather than overflowing.

### Launcher Tiles (Atalhos)
Big targets, icon over name.
- 34px icon above a 12px 600 name, centred in a 62px cell, 14px radius, no fill at rest.
- The first tile is lifted (0.075 fill) so Enter has an obvious target; while searching, the first match takes a 14% accent fill and a 45% accent inner edge.
- Hover 0.07 fill; press scales to 0.95; focus is a 2px accent outline inset.

### Dock
- **Style:** a floating capsule (block fill, inner edge, 12px radius, 3px padding) at the island's bottom centre; icon items 30px tall, 9px radius, Ink 2.
- **Active:** 17% accent fill, icon in accent, and the page name slides open beside it in white (max-width eases over 0.55s).
- **Hover / Press:** 0.1 fill and white; press scales to 0.92. Items reorder by dragging (lifted 0.22 fill + shadow). A 1px × 14px divider separates groups.

### Rows (Settings and quick settings)
- No box. Label (title) and hint stacked at left, control at right, 16px gap, separated by a bottom hairline. Settings rows are at least 56px; the island's quick rows at least 44px and drop the last hairline.
- A row reached from search flashes a 16% accent wash that fades over 1.6s.

### Toggles
- Capsule track at 0.18, white knob with a small drop shadow; on, the track turns accent and the knob slides 16px on the main ease. Settings uses 42 × 26; the island's quick settings 38 × 22.

### Buttons
- **Shape:** 9px radius, 32px tall, 14px sides, 12px 600.
- **Default:** 0.12 fill, hover 0.2, press scales to 0.94, disabled 40% opacity.
- **Primary:** accent fill with dark on-accent text; hover brightens 10%.
- **Danger:** text in soft red; icon buttons get a red-tinted hover.
- **Icon buttons:** 34px square, 10px radius, Ink 2, hover 0.12 fill; "on" state is accent icon only.

### Chips
- **Style:** 26px capsules, 0.07 fill, 11.5px 600 in Ink 2, counts in tabular numerals at reduced opacity. Filter rows scroll sideways without a scrollbar.
- **State:** selected is a solid accent fill with dark text. Timer duration chips use the mode colour instead of the accent.

### Navigation (Settings rail)
- 34px items, 9px radius, 13px 550 in Ink 2 with an icon; groups titled in 11px 600 Ink 3. Hover 0.05 fill and white; selected is a 13% accent fill, white text and accent icon. Sub-tabs within an area are a 3px-padded segmented strip (0.05) with the selected tab at 0.12 and its count in accent.

### Preview Stage (Settings)
- A 168px stage-black panel, 18px radius, inner edge, with the glow drifting behind and a miniature island hung from its top edge. The miniature re-renders from live config in the same frame.

### Timer Chip (pill)
- A 22px capsule at the pill's right, tinted 16% of the mode colour (`--tc`: pink focus, green break, violet custom) with a small progress ring and 12px 650 tabular time. Kept visually apart from the clock.

### Alarm
- When a timer ends the island's lit edge turns alarm red and an inner red bloom pulses four times (1.2s); a 20px red bell circle rings three times. Reduced motion keeps a static red bloom.

### Eyes
- Two white ovals (15 × 17 and 13 × 15, the right one tilted −6°) with 5.6px pupils that follow the cursor; lids are black bands driven by `--lt`/`--lb` for blink, sleep, wide and closed moods. They sit at the island's top left and the content starts after them (62px header inset; 22px when eyes are off).

## Do's and Don'ts

### Do:
- **Do** route every island accent through `var(--accent, #ff5c7a)` so the album colour takes over.
- **Do** keep blocks flat: a 0.06 to 0.07 white fill and a 1px inner edge.
- **Do** separate options with a 1px hairline at 0.07, not with boxes.
- **Do** use the main ease `cubic-bezier(0.22, 1, 0.36, 1)` for movement and give every animation a `.reduce-motion` fallback.
- **Do** use tabular numerals for times, counts and percentages.
- **Do** keep hints and placeholders at Ink 3 (0.5) or stronger.
- **Do** put the active page's input in the island header row.

### Don't:
- **Don't** use the accent for decoration; it marks active, selected, focused or primary only.
- **Don't** put the glow anywhere except under the island's bottom edge and behind the Settings preview stage.
- **Don't** fill blocks or tiles with vertical glass gradients or add backdrop blur.
- **Don't** use uppercase, letter-spaced labels or kicker lines above titles; group titles are sentence case 12px Ink 3.
- **Don't** add a light theme or grey boxed setting groups.
- **Don't** use alarm red for anything except a timer ending.
