---
version: 1
slug: "src-island-island-tsx"
primary_target: "src/island/Island.tsx"
related_targets: ["src/island/pages/LauncherPage.tsx","src/island/island.css"]
---

Surface: the island opened (expanded), led by the Atalhos page. Mode: Operate. The person opens it many times a day to launch a shortcut, search one by name, or jump to another page; all three matter equally.

Confirmed answers: mixed use (click a fixed shortcut, search, change page); date and time stay at the top for styling, with an option to hide them for testing; the island may grow, but only slightly; avoid extra clicks, small icons, a Windows-menu look, and heavy glow/glass effects.

## Direction contract

THESIS: The search is the header. Opening the island on Atalhos puts the field where the eye already is, so typing filters at once and big shortcuts sit right below; refuses the stacked "header row, then a search tile, then small chips" arrangement.

OWN-WORLD: The Settings world carried into the island: pure black, flat surfaces at rgba(255,255,255,.06) with a hairline inner edge (no glass gradients), Inter, one pink #FF5C7A used only for what is active (dock page, focused field, first match), the pink→purple glow kept low behind the bottom edge.

STORY: The person sees their eight most-used shortcuts as large icons, recognizes one at a glance and clicks, or just starts typing (any key focuses the search) and presses Enter; the dock under it changes page.

FIRST VIEWPORT: 532 x 252 island. Header row: eyes at left, a 30px search field filling the middle ("Buscar entre N atalhos", Enter hint), date in ink2 and bold time at right, then expand. Body: 4 x 2 grid of 64px tiles, 34px icon above a 12px name, the first tile lifted. Below it one quiet line, "+N atalhos · sections", opening the large view. Dock at the bottom, active page tinted pink.

FORM: Busca no topo, structure 3 of my ordered list of 7, seed:20311f525704e309.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
