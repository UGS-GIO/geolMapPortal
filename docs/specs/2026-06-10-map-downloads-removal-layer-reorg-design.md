# Remove the Map Downloads Mode + Footprints Reorg — Design Spec

**Date:** 2026-06-10
**Status:** Approved in brainstorm (visual companion + terminal); pending spec review.
**Branch:** to branch from `feat/readout-redesign` (PR #153), which carries the
consolidated readout this work depends on. (A stub `feat/layer-list-tools-reorg`
exists; rebase it onto #153's tip or cut a fresh branch.)

## Goal

Retire the separate **Map Downloads** mode (the `#identifyPanel`
Unit-Descriptions/Map-Downloads tabs, the `#mapsPane` swiper carousel, and
`printPubs`) now that the consolidated readout has full content parity, and
rehome the footprint-browsing it gated into a single, quiet-by-default control in
the Layers panel. One click path, one panel, no mode.

## Background (why this is now safe)

The `footprints` FeatureLayer (`layers[5]`, the AGOL
`Geologic_Map_Footprints_View`) is already the shared index of "which published
maps cover this point" — **both** the readout path (`queryUnits → fetchAttributes
→ buildAccordion`) and the downloads path (`fetchDownloads → getData →
printPubs`) query it (mapcontrols.js ~1962–2040). The *mode* only governs four
things:

1. Footprints **visibility** (red outlines) + the **scale-filter**
   `definitionExpression` (the `#btn-250k…` buttons, applied to the click query
   only in downloads mode — mapcontrols.js:2015).
2. Which **click path** runs (readout accordion vs. the `printPubs` swiper —
   gated on `$(".map-downloads").hasClass("selected")`).
3. The **swiper UI** (`#mapsPane`, dock/undock `#toggleSidebar`, paging).
4. The **map-search** result flow, which force-switches to downloads mode and
   renders the hit in the carousel (mapcontrols.js:3000–3024).

The readout already reproduces every download/citation/tool the carousel offered:
six resource chips (`renderResources`), citation + Copy (`buildCitation`), the
written-out DOI / Publication Page link (`buildPubLink`), the cross-section / lith
/ preview image viewer, and a `.res-tools` row with Pan to / Zoom to / Copy link
(mapcontrols.js:2162). It also already handles the **no-unit empty state** (a
map's resources render even when no unit polygon sits under the interaction —
`loadUnitDescription`'s no-unit/catch branches call `fillResources`). Those two
facts are what make removal non-destructive.

## Scope

- **In:** remove the Map Downloads mode/card/swiper; route every click to the
  readout; a three-state **Map footprints** control in the Layers panel (Off /
  This map / All maps) with the scale filter as a sub-row; reroute map-search to
  the readout; delete the now-dead code.
- **Out (this pass):** geology-layer scale-dependency rework ("always-on");
  folding the opacity control into the Layers panel; right-panel overlap fixes;
  relocating the readout. **No new libraries, no build step.** (Opacity stays its
  own `#opacityPanel` flyout, untouched.)

## Design

### 1. Remove the mode; click always opens the readout

- Delete the `#identifyPanel` markup (the `.unit-descs` / `.map-downloads` tabs)
  and the `.identify` toggle button; there is no longer a mode to switch.
- In the `view.on("click", …)` handler, drop the
  `$(".map-downloads").hasClass("selected")` branch that calls `fetchDownloads`.
  Every click runs the readout path (`queryUnits → fetchAttributes →
  buildAccordion`). `fetchDownloads` is removed.
- In `queryUnits`, the `definitionExpression` filter currently applied only in
  downloads mode (mapcontrols.js:2015) is **driven by the new footprints
  control** instead (see §2): when "All maps" has a scale filter active, the same
  expression scopes the click query; otherwise the query is unfiltered.

### 2. The "Map footprints" control (Layers panel)

Replace the disabled `#footprints` checkbox and the `#scaleBtns` button row with
one labeled control, **Map footprints**, sitting directly under the geology-scale
layer checkboxes. Three mutually-exclusive states (segmented control or radio
group), default **Off**:

- **Off (default):** the `footprints` layer is hidden; no on-map outlines; no
  highlight. Nothing is drawn until the user opts in. This is the quiet default
  the user asked for.
- **This map:** when the readout is open, highlight **only the active map's**
  footprint — the sheet whose section is open in the accordion — by drawing its
  polygon onto `graphicsLayer` (reuse the existing `highlightMap` /
  `hlOutline` mechanism). The highlight **switches** as the user opens a
  different accordion section and **clears** when the readout closes.
  **Statewide / nationwide sheets are excluded** (the 1:500,000 and 2,500k
  layers — their footprint is the whole state, so highlighting it is noise). The
  full `footprints` layer stays hidden in this state; only the single active
  outline shows.
- **All maps:** the `footprints` layer is visible (all outlines), and the
  **scale filter** appears as a sub-row beneath the control — the existing
  five options **All / 250K / Interm / 24K / Other**, setting the layer's
  `definitionExpression` exactly as the `#btn-*` handlers do today
  (mapcontrols.js:1529–1559). This is the survey/discovery view. The scale-row is
  hidden under "This map" and "Off."

Clicking the map still opens the readout in every state; "All maps" just also
draws the footprints, and (if a scale filter is set) scopes the click query to
that scale class.

### 3. Reroute map-search to the readout

The `searchMaps` widget (`#search-esri`) searches the footprints layer, so its
results are footprint features — directly consumable by the readout builder.

- `search-complete` (mapcontrols.js:3000–3024): **remove** the forced mode switch
  and the `getData → printPubs` call. Instead, `view.goTo(...)` to the result
  extent and feed the result feature(s) into the readout path
  (`fetchAttributes` / `buildAccordion`) so the map opens in the readout.
- Because a search has no clicked unit, the readout opens in its **no-unit empty
  state** (resources / citation / downloads render; no unit description). In the
  unit-description slot, show a short prompt: **"Click the map to identify a
  geologic unit."** so the area reads as intentional, not broken.
- `search-clear` (mapcontrols.js:2987–2998): drop the mode-reset and
  `#mapsPane` hide; just clear `graphicsLayer`.

### 4. Cleanup (dead code to remove)

Once the above lands, remove what only existed for the mode/carousel:

- **JS:** `printPubs`; `fetchDownloads`; `toggleMapDl` / `toggleUnitDesc`;
  `hideMapsPane` / `showMapsPane` and the `#toggleSidebar` / `.dl-close`
  handlers; the Swiper instance init + its `slideChange`/keyboard config and the
  `mySwiper` references; the `.identify` and `#identifyPanel a` mode handlers; the
  `#btn-*` handlers fold into the new control (§2). Verify `getData` has no
  remaining caller after `printPubs` and the search reroute are done; remove it
  if orphaned (keep the readout's own `getPubData`/`fillResources` path intact).
- **HTML (`index.html`):** the `#identifyPanel` block (257–260); the `#mapsPane`
  block (436+) and its dock/`.dl-close` chrome; the old `#footprints` checkbox +
  `#scaleBtns` (298–306), replaced by the new control.
- **CSS (`style.css`):** the `#mapsPane` / swiper / dock styles and the
  Map-Downloads-only mobile media queries; keep the legacy
  `.pdfIcon/.gisIcon/...` rules **only if** still referenced (they were retained
  for `printPubs`; once `printPubs` is gone, confirm nothing else uses them
  before deleting).

## Preserved exactly (no change)

The consolidated readout and its parity surface; the `footprints` layer as the
click index; the geology layers' current scale-dependency; the opacity / search /
geocoder / config / unit-search panels; the readout's empty-state behavior; the
`highlightMap` / `hlOutline` graphic mechanism (now driven by "This map" instead
of the carousel's slideChange).

## Testing (manual — no frontend test runner)

On the preview channel, desktop + mobile:

- **Click** a unit map (M-249) → readout with units + downloads; a no-unit / pub
  map (MP-17-2DM) → empty-state readout with resources. No mode tabs anywhere.
- **Footprints control:** Off → nothing drawn. This map → exactly one outline on
  the active sheet; open another accordion section → outline moves; close →
  clears; statewide map → no outline. All maps → all footprints draw; the scale
  filter thins them and (verify) scopes the click query.
- **Search** a map → it pans/zooms and opens in the readout with the "click to
  identify" prompt; downloads present; `search-clear` tidies up.
- Confirm no console errors from removed Swiper/`#mapsPane`/mode references; the
  readout's sticky header, toggles, and image viewer still work.

## Risks / watch-items

- **`highlightMap` feature shape:** it reads `feature.Geometry` / `feature.Extent`
  (the `mapGeometry`-shaped object used by the old carousel), while the readout's
  footprint features are raw query results (lowercase `.geometry`). "This map"
  must build/adapt the right shape (small helper, or reuse `mapGeometry`).
- **`getData` reuse:** confirm it is only the downloads/search fetch before
  deleting; the readout's data path must stay intact.
- **Mobile:** the mode/carousel had mobile-specific handlers (bottom sheet,
  search reset). Removing them must not leave the mobile readout (bottom sheet)
  broken.

## Self-review

- **Placeholders:** none.
- **Consistency:** the footprints control matches the approved companion mockup
  (Off / This map / All maps, scale filter only under "All"); the search empty
  state matches the approved "click to identify" prompt.
- **Scope:** focused on mode removal + footprints rehoming + search reroute +
  cleanup; scale-dependency, opacity-folding, overlap, and readout relocation are
  explicitly deferred.
- **Ambiguity:** "This map" highlights the single active sheet (not all maps
  under the click), excludes statewide/nationwide, and is opt-in; the scale
  filter lives only under "All maps."
