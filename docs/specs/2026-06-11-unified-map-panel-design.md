# Unified "Map" Panel (Layers ⇄ Identify) — Design Spec

**Date:** 2026-06-11
**Status:** Approved in brainstorm (visual companion, Direction C + detail mock); pending spec review.
**Branch:** builds on `feat/remove-map-downloads-mode` (PR #155).

## Goal

Collapse the global **Layers** panel and the click-driven **readout** into ONE
bottom-right panel with a two-tab bar — **Layers** (global, resting) and
**Identify** (the readout) — in the readout's Refined-Light language. This fixes
the archaic, light-gray, overlapping Layers panel by giving it the readout's home
+ style, and makes layer control available *before* a click (as the panel's
resting state). It also reworks the #155 footprints control: the survey overlay
becomes a Layers-tab toggle, and the "this map" extent becomes an Identify-header
toggle.

## Background — why this is low-risk

- The readout (`#unitsPane`) is already the bottom-right Refined-Light panel
  (`position:absolute; bottom; right; z-index:99; white`). We reuse it as the
  unified container.
- The Layers panel (`#layersPanel`) is plain checkboxes — `#500k`, `#100k`,
  `#24k`, `#reference`, `#2500k` (class `.list_item`) — wired to
  `setLayerVisibility` (mapcontrols.js ~63), the `$("#layersPanel").change`
  handler (~1141), the **readout's per-map toggle** (which dispatches a `change`
  on these checkboxes, ~2108), and URL layer-state (`$('#layersPanel').find('input')`,
  ~3029). **We RELOCATE the `#layersPanel` element into the unified panel and
  RESTYLE its checkboxes as switches — keeping its `id` and all its inputs — so
  none of that wiring changes.**
- The footprints mechanisms from #155 (the `footprints` layer, `fpHighlightLayer`
  + `hlOutline` + `highlightActiveMap`, `footprintScaleExpr` + the scale `data-expr`
  values, the click-query scoping) are REUSED; only the control UI is split across
  the two tabs.

## Scope

- **In:** a tab bar on `#unitsPane`; relocate + restyle `#layersPanel` as the
  Layers tab; restyle the geology/reference checkboxes as Refined-Light switches;
  split footprints (survey toggle in Layers, Extent toggle in Identify) replacing
  the `.footprints-control` segmented control; panel open/collapse + active-tab
  state with first-load-collapsed then remembered (localStorage); repoint
  `#layers-button` to open the Layers tab.
- **Out:** any change to the Identify/readout content (unchanged); the opacity
  flyout (stays its own control); migrating reference layers into the basemap
  switcher (**deferred** — reference layers stay as a Layers-tab group for now);
  the geology scale-dependency model (unchanged `min/maxScale` auto show/hide).
  **No new libraries, no build step.**

## Design

### 1. The unified panel (`#unitsPane`)
- Keep its bottom-right position + Refined-Light styling.
- Add a **tab bar** at the very top (above `#udTab`): two tabs, **Layers** and
  **Identify**, with the accent underline on the active one.
- Two content panes inside: the relocated `#layersPanel` (Layers) and `#udTab`
  (the existing readout, Identify). Show one per active tab.
- The existing close button collapses the WHOLE panel.

### 2. Layers tab — relocate + restyle `#layersPanel`
- Move the `#layersPanel` element to be the Layers pane inside `#unitsPane`. **Keep
  `id="layersPanel"` and every `input.list_item`** so `setLayerVisibility`, the
  change handler, the readout sync, and URL state keep working. Drop its standalone
  absolute positioning, the dark `.theme-color` look, the `#ccc` text, and the
  Bebas-20 chrome.
- **Geology group** (`#500k`, `#100k`, `#24k`): restyle the checkboxes as
  Refined-Light toggle switches (CSS on `.list_item` + its label, mirroring the
  readout's `.layer-switch`). Hint line: "scale-dependent — shows at the right
  zoom." (auto show/hide unchanged.)
- **Reference group** (`#reference`, `#2500k`): same switch styling, under a small
  "Base & reference" label.
- Remove the old `.layer-panel-title` text + the `#layers-close` anchor (the tab
  bar + the panel's close button replace them).

### 3. Footprints — split across the tabs (replace `.footprints-control`)
- Remove the `.footprints-control` (Off / This map / All segmented control) and
  `#fpScale` markup from the panel.
- **Layers tab → a "Map footprints" survey toggle** (one switch). On → `footprints`
  layer visible + reveal the scale filter (All / 250K / Interm / 24K / Other — the
  existing `data-expr` values driving `footprintScaleExpr`, the layer's
  `definitionExpression`, and the click-query scope). Off → hidden. (This is #155's
  "All maps" behavior as a plain toggle.)
- **Identify header → an "Extent" toggle.** On → the active readout sheet's
  footprint outlines (`highlightActiveMap` on `fpHighlightLayer` with `hlOutline`,
  statewide-excluded, following the open accordion section, reverting to the
  primary on collapse). Off → cleared. (This is #155's "This map" behavior as a
  toggle.)
- Net: `setFootprintMode`'s three-state machine collapses into two booleans — a
  survey flag (Layers) and an extent flag (Identify) — both reusing the same
  underlying layer / highlight / scale plumbing.

### 4. State + behavior
- Panel state = `{ collapsed: bool, tab: 'layers' | 'identify' }`, persisted to
  `localStorage`.
- **First-ever load** (no stored state): collapsed.
- **Subsequent loads:** restore the stored state (open/collapsed + tab).
- **Click a map** → open the panel, tab = Identify (readout populates as today).
- **`#layers-button`** → open the panel, tab = Layers.
- **Tab clicks** switch panes; the readout DOM is preserved when on Layers, so
  flipping back is instant.
- **Close button** → collapse (persist).
- **Identify before any click:** a gentle empty state ("Click the map to identify
  geology.").

## Preserved exactly

The entire Identify/readout content + behavior; geology layers + scale-dependency;
the footprints layer + highlight + scale plumbing; the opacity flyout; the basemap
switcher; `setLayerVisibility` / the layers `change` handler / URL layer-state /
the readout↔checkbox sync.

## Migration from #155

The `.footprints-control` (Off/This map/All) is removed; its two real behaviors
move to the survey toggle (Layers) and the Extent toggle (Identify). The
`.fp-seg*` / `#fpScale` markup and the `setFootprintMode` three-state JS are
replaced by the two booleans; the `fpHighlightLayer` / `hlOutline` /
`footprintScaleExpr` / scale-expr plumbing stays.

## Watch-items / risks

- **Relocating `#layersPanel` must keep its `id` + inputs intact** — every
  `$("#layersPanel")…` selector and the readout's `change`-dispatch sync depend on
  them. Restyle via CSS; do NOT rebuild the inputs.
- **`$("#layersPanel").after(dialogNd)`** (mapcontrols.js ~3116) positions a dialog
  after the layers panel; relocating the panel may move/break that — re-anchor it.
- The `#layers-close` handler and the `#layers-button` / outside-click toggle logic
  (mapcontrols.js ~500, ~1366, ~1406) must be repointed to the tab/collapse model
  instead of the standalone `hidden`-toggle.
- **Mobile:** `#unitsPane` is a bottom sheet on small screens; the tab bar must work
  there too.
- The readout's per-map toggle (`change` on a `#layersPanel` checkbox) must still
  resolve now that the checkbox lives in the Layers tab — it will, since the
  `id`/input is preserved.

## Testing (manual — no test runner; verify on the preview)

- Load → panel collapsed; open Layers, reload → restored open/Layers. Click a map →
  Identify; toolbar Layers button → Layers; tab back and forth (readout intact).
- Geology switches toggle the layers AND stay in sync with the readout's per-map
  toggles; scale-dependency still auto show/hides on zoom; reference switches work.
- Footprints **survey** toggle (Layers) draws/filters footprints + scopes the click
  query; **Extent** toggle (Identify) outlines the active sheet, follows sections,
  reverts on collapse, clears on off/close.
- Mobile bottom sheet: tabs + content usable; no overlap; no console errors.

## Self-review

- **Placeholders:** none.
- **Consistency:** matches the approved Direction-C detail mock (Layers ⇄ Identify,
  Extent in the header); the Identify tab is unchanged.
- **Scope:** unify + relocate/restyle + footprints split + persistence; readout,
  opacity, basemap, and scale-dependency untouched; reference-→-basemap deferred.
- **Ambiguity:** footprints become two booleans (survey / extent); `#layersPanel`
  is relocated + restyled (not rebuilt) to preserve all wiring.
