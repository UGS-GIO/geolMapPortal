# Handoff — Right-rail tools restyle (geolMapPortal)

**For a fresh session.** Read this first, then the spec/plan it references. This continues an in-flight design effort; the prior session got large, so this hands off the *next* piece.

## Project basics
- **geolMapPortal** — UGS interactive geologic map portal. **Vanilla JS** (ArcGIS Maps SDK for JavaScript 4.29 + jQuery), plain HTML/CSS. **No build step, no module system, NO test runner.**
- **Verify:** `node --check public/mapcontrols.js`; CSS brace balance (`node -e "const s=require('fs').readFileSync('public/style.css','utf8');const o=(s.match(/{/g)||[]).length,c=(s.match(/}/g)||[]).length;console.log(o===c?'BALANCED':'MISMATCH')"`); then **manually on the PR preview channel** (the real check — there are no automated UI tests).
- **Worktree:** `/Users/marshallrobinson/Documents/git_projects/geolMapPortal-layer-list`, branch **`feat/unified-map-panel`** (**PR #156**). Build here (or a branch off it); push → PR #156's Firebase preview redeploys; verify there.
- **Commits:** Conventional Commits. **Never name the model / add AI attribution** anywhere (commits, PR, code) — repo rule.

## The 3-PR stack (all open, await the user's preview sign-off + bottom-up merge to `dev`)
- **#153** `feat/readout-redesign` — consolidated readout (Refined Light) + "Units" pill.
- **#155** `feat/remove-map-downloads-mode` — removed the Map Downloads mode/swiper; footprints split.
- **#156** `feat/unified-map-panel` — **the unified "Map" panel** (this branch). Spec/plan: `docs/specs/2026-06-11-unified-map-panel-design.md`, `docs/plans/2026-06-11-unified-map-panel.md`.

## Design system to match ("Refined Light")
- **Panels:** white. `#unitsPane` is the bottom-right panel (white, ~0.96 opacity).
- **Cards / rows:** bg `#f5f6f8`, `1px solid #e3e3e3`, radius 5px, hover `#eceff4` (see `.map-section` and `#unitsPane #layersPanel .map-layer`).
- **Type:** titles in `"Bebas Neue Regular"` — `#4a4a4a` (rows), `#235c87` (panel/primary). Section labels: uppercase, letter-spaced, muted `#9a9a9a`/`#9aa0a6` (`.lyr-group`, `.other-maps-label`).
- **Accent** `#326A98` (icons, selected, accent bars). **Toggle-on** `#6396fc`.
- **Toggle switch:** reuse `.layer-switch-slider` (30×17 pill, `#c6c6c6`→`#6396fc`, white knob) — do NOT hand-roll a look-alike.
- **Tab bar:** `.panel-tabs` / `.panel-tab` (Bebas, accent underline when `.selected`).
- **Range slider:** `.op-range` (native input; thin `#e3e3e3` track, accent gradient fill, `#326A98` thumb).

## What #156 already is (so you don't redo it)
`#unitsPane` is now ONE bottom-right panel with a **Layers ⇄ Identify** tab bar:
- **Identify tab** (`#udTab`) = the readout (unchanged) + an "Extent" toggle in its head.
- **Layers tab** = the relocated `#layersPanel` (kept its id + inputs): geology + reference layers as `.lyr-row` cards with real `.layer-switch-slider` toggles; a **Map footprints** survey toggle with the scale-filter **badges inline on its row** (`#fpScale`); a **Display** group holding the **Opacity** slider.
- Panel `{collapsed, tab}` persists in `localStorage`.
- **Opacity** was folded into the Display group; the standalone `#opacityPanel` flyout **and its rail icon were removed**.
- An "auto show/hide by zoom" toggle was tried and **removed** — geology layers are **manual** (they still render within their own `min/maxScale`). Scale-dependency status **dots** (green=in-range, gray=out-of-range) sit on the Layers rows. (Known: `activateLayers` only refreshes on layer-change, not on zoom — dots can go stale; not addressed, low priority.)

## YOUR TASK: restyle the rest of the right-rail tools to the design system
The left icon column (`.leaflet-left`, `style.css` ~214-281) holds icon buttons that open **flyout panels** still in the **old dark `theme-color` (#565656)** style. Bring them to Refined Light. The user's rule: **match the design system, but NOT necessarily fold everything into the one panel.**

**The tools** (icons at `index.html` ~218-281; panels nearby):
- **Search maps** `.search` → `#searchPanel` (`#search-esri`, an Esri Search over maps; results route to the readout already). Restyle the flyout + the Esri widget.
- **Geocoder/locate** `.geocoder` → `#geocoderPanel` (`#geocoder`, Esri Search for places). Restyle.
- **Configuration/scale** `.configuration` → `#configPanel`. Restyle (or fold what's useful).
- **Unit search** `.searchunits` → `#unitsrchPanel`. Restyle.
- **Strat columns** `.strat` (toggle). Restyle.
- **Basemap switcher** (the topo/imagery/hillshade controls near the top, `.legTopo`/`.activebase` etc.). Restyle; **the user wants reference layers (Streets & Reference, U.S. Geology — currently in the Layers tab) considered for moving INTO the basemap switcher** (they're really basemap/overlay material). This was deferred from #156.
- **Layers** `.layers` (opens the unified panel to Layers — done). **Identify** `.identify` (click-mode icon; may be vestigial post-#155 — check before touching).
- **Opacity** — DONE (removed).

**Recommended categorization (the user approved):**
- *Map-display* (layers, opacity, footprints, basemap) → the Map/Layers surface. Opacity folded in; basemap stays its own switcher, restyled.
- *Find tools* (map search, geocode, unit search) → clean Refined-Light **flyouts** off the rail (or a single unified search) — NOT crammed into the panel.
- *Utilities* (config, strat, help) → restyled popovers.
- *The rail itself* → restyle the icon column + the buttons' open/active state (`.rightbarExpanded`).

## How to work (the user's expectations — important)
- **The user is design-sensitive and wants OPTIONS.** Use the **visual companion** (superpowers `brainstorming` skill → `scripts/start-server.sh --project-dir <worktree>`; idles after ~30 min, restart as needed; write HTML fragments to `screen_dir`; `.card`/`toggleSelect()`). Mock the rail + flyout treatments, get sign-off, THEN build. They have repeatedly (and rightly) caught blind-CSS misses.
- **Reuse the readout's REAL components** and verify visually on the preview — don't ship CSS you've never seen rendered.
- Mechanical wiring can go to subagents with precise specs; keep the **design/look** under your control (mock → sign-off → review on the preview).
- Start each design topic by confirming scope with the user; build one focused piece, push, let them react on the #156 preview.

## Deferred / not in scope unless asked
- Move reference layers into the basemap switcher (the user flagged interest — confirm before doing).
- The `activateLayers`-on-zoom dot staleness.
- Geology layer scale-dependency thresholds (the user removed the auto-switch entirely).

## Quick start for the new session
1. `cd /Users/marshallrobinson/Documents/git_projects/geolMapPortal-layer-list` (on `feat/unified-map-panel`).
2. Read the #156 spec/plan + skim `public/index.html` (the rail icons ~218-281, the flyout panels) and `public/style.css` (`.leaflet-left`, the `.search`/`.geocoder`/etc. icon rules, `#searchPanel`/`#geocoderPanel`/`#configPanel`/`#unitsrchPanel`, and the `#unitsPane #layersPanel` Refined-Light block to mirror).
3. Offer the visual companion; mock the rail + flyout direction; get the user's pick; build; push; verify on the PR #156 preview.
