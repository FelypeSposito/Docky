---
version: 1
slug: "src-settings-settings-tsx"
primary_target: "src/settings/Settings.tsx"
related_targets: ["src/settings/settings.css"]
---

## Scope
Settings window of Docky (src/settings). Visitor mode: Operate. Audience: anyone who installed Docky from GitHub, plus the author; the jobs that happen most are editing shortcuts and sections, first-time setup and integrations (Claude Code, Google Agenda). Constraints: Portuguese UI, Inter, black + pink/purple glow, everything that works today keeps working (drag to reorder, icon picker, suggestions, panels that scroll into view). The window becomes user-resizable.

## Direction contract
THESIS: Settings you can see happen. A left rail finds any option in one step, and every area opens under a live miniature of the island that changes as you change it. Refuses the category default of a long form of grey boxed groups behind a tab strip.
OWN-WORLD: the island's own world, held to Operate: near-black ground, the rail a shade lifted from it, rows on hairlines instead of boxed cards, one pink accent (#FF5C7A) for the selected area, toggles and primary actions, the pink/purple glow only behind the preview stage. Inter, tabular numerals, sentence-case labels, muted hints at readable contrast.
STORY: the visitor sees where everything is (rail + search), sees what the current area does to the island (preview), changes it in a single clean column, and never hunts: search jumps straight to an option and flashes it.
FIRST VIEWPORT: rail 240px at left with eyes + "Configurações", search field, nav in three groups (main areas with Atalhos first, Conexões, Sistema). Right: drag strip with window controls; the preview stage (about 170px) with the mini island hung from its top edge; under it the area title, one-line lead, and the area's rows. Atalhos adds sub-tabs: Atalhos, Seções, Grupos, Ícones.
FORM: Prévia viva, position 5 on the ordered list, dealt lead. seed:09bec386e925bd88
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Signature interaction
The mini island in the preview stage re-renders from the live config: shortcuts and sections, page order in the dock, glow strength, eyes on/off, lyric pill, timer, Claude strip, Shelf folders. Changing a control changes the miniature in the same frame.

## Unresolved
Reserving screen space so the island does not cover other apps (Chrome's address bar) is a separate follow-up, not part of this surface.
