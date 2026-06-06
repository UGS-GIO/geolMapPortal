# Consolidated Feature Readout Panel — Design Spec

**Date:** 2026-06-06
**Status:** Proposed — design approved in discussion; pending spec review.
**Branch:** `feat/consolidated-readout-panel` (off `dev`).

## Goal

Fold everything the separate "Map Downloads" card provides (downloads, citation,
and per‑map actions) into the click‑driven unit‑description readout, so a single
panel answers "what unit is here, from which map, and what can I do with that
map." Use the space reclaimed from the card with a **responsive** layout, and
collapse the readout to **one** scroll container so the multi‑scrollbar confusion
goes away. Vanilla only — this is a stopgap ahead of the eventual MapLibre/React
(ugs‑map‑viewer) migration; **no new libraries, no build step**.

## Background — current state (on `dev`)

- **Readout** (`public/mapcontrols.js`): a map click runs `fetchAttributes()`,
  which sorts the footprints at the point and renders `buildAccordion()` into
  `#udTab` inside `#unitsPane`. The clicked map is the open primary section; other
  maps are collapsed accordion cards (single‑open). Each section lazy‑loads via
  `loadSection()` → `loadUnitDescription()` (`units==='True'`) or
  `loadPublicationOnly()` (others). Today a section shows: unit identity
  (symbol/name/age), description, a reference line (**DOI Link** for UGS/UGMS,
  **Publication Page** for others), and a "Show on map" layer toggle.
- **Map Downloads** (separate mode): `#identifyPanel` toggles Unit Descriptions ↔
  Map Downloads (`toggleUnitDesc()` / `toggleMapDl()`); Map Downloads shows the
  footprints layer plus a Swiper carousel (`#mapsPane`) built by `printPubs()`.
  Each carousel slide carries: a publication‑page title link, share actions
  (shareable link, pan‑to, zoom‑to; pin / "list maps" are already hidden), the
  citation (`reftxt`, with copy‑to‑clipboard), a preview thumbnail, and download
  links (PDF / GIS / GeoTIFF / Cross‑section / Purchase).
- **Data sources:**
  - Unit description (`units==='True'`): pg_featureserv
    `unit_desc_sym_age_by_point_scale` → `unit_symbol`, `unit_name`, `age`,
    `unit_description`.
  - Publication record: the Firebase `getData` function
    (`${projectName}/getData?mapid=<series_id>`; multiple `mapid` allowed) →
    `pub_url` (PDF), `gis_data`, `geotiff`, `x_section`, `lith_col`,
    `bsurl`/bookstore, `pub_thumb` (preview), `pub_publisher`, `pub_author`,
    `pub_sec_author`, `pub_year`, `pub_name`, `pub_scale`, `series_id`,
    `quad_name`. Memoized + prefetched today by `prefetchPubData()` /
    `getPubData()` — but only for `units!=='True'` footprints.
  - Footprint attributes (footprints layer): `series_id`, `quad_name`, `scale`,
    `units`, `geomaps_service`, `pub_year`, `resturl`, plus the feature geometry
    (used for extent / pan‑zoom).
  - Derived links: DOI `https://doi.org/10.34191/<series_id>` (UGS/UGMS);
    publication page `https://geology.utah.gov/publication-details/?pub=<series_id>`
    (others); purchase `https://utahmapstore.com/products/<series_id>`; file
    downloads under `https://ugspub.nr.utah.gov/publications/<path>`.

## Non‑goals (out of scope for this spec)

- The **layer‑list / tools reorg** (`#layersPanel`, transparency, the footprint
  scale‑filter buttons `#btn-*`). That is the next item‑6 sub‑project with its
  own spec.
- The **MapLibre/React migration**. This panel is a deliberate vanilla stopgap.
- A fully mobile‑native experience (gesture bottom sheet, etc.) — we do a
  pragmatic responsive treatment only.
- Changing the data sources/endpoints or the footprint/publication schemas.

## Design overview

One panel, one scrollbar, **responsive disclosure**:

- On a **wide** viewport the panel widens into the reclaimed card space and an
  open section is **two columns** — description on the left, a "resources rail"
  (publication link, downloads, citation, tools, layer toggle) on the right. The
  rail means no expanders are needed on desktop: more is visible, fewer clicks.
- On a **narrow** viewport the panel becomes a full‑width bottom sheet, the
  section is **one column**, the resources collapse back into progressive‑
  disclosure groups ("Downloads & citation", "Map tools"), and the description
  truncates with "Show more".
- Same DOM in both cases — CSS breakpoint flips columns ↔ stacked. No JS layout
  branching, no library.

### Responsive rules (concrete)

- Breakpoint: **768px** viewport width (matches ugs‑map‑viewer's `useIsMobile`,
  for forward consistency).
- **≥768px (desktop):** `#unitsPane` width ≈ **440px** (up from 300px), opacity
  raised from 0.85 → **0.96** (download/citation text must be crisp). Open
  section body = CSS grid, two columns ≈ 60% description / 40% resources rail
  (rail min ~165px). Description shown **in full** (it has its own column; the
  panel scrolls if needed).
- **<768px (mobile):** `#unitsPane` becomes a bottom‑anchored, full‑width sheet
  (max‑height ≈ 70vh). Single column. Resources render as collapsible groups.
  Description truncates to ~5 lines with a "Show more"/"Show less" toggle.
- **Stretch (optional, not required for parity):** a drag handle to resize the
  desktop panel width, persisted to `localStorage`. Marked optional so the core
  ships without it.

### Scroll model

- `#unitsPane` is the **single** scroll container (`overflow-y:auto`,
  `max-height`). No inner `vh`‑capped scroll boxes (removes the
  `.map-readout` / `.readout-others` / `.map-section-readout` nested scrolls that
  caused the multi‑scrollbar confusion and the zoom clipping).
- Because every section is compact by default (full‑but‑single‑column or
  two‑column rail; expanders collapsed on mobile; description truncated on
  mobile), the clicked map and the collapsed "other maps" headers fit with one
  scrollbar; you only scroll when you deliberately expand/expand a long
  description.
- The **panel header** (clicked‑map title + close ✕) is `position:sticky` at the
  top of the scroll container, so close is always reachable (also resolves the
  earlier "close button scrolls away" issue).

## Section anatomy

### `units==='True'` (has a unit description)

Header (accordion trigger): `1:24,000 · Provo · M-249 · 1991` + chevron + (when
its category has a real layer) the "Show on map" toggle.

Open body:
- **Unit identity:** `Qal: Alluvium (Holocene)` (`.unit-desc-title`).
- **Description:** full on desktop; truncated + "Show more" on mobile.
- **Resources** (rail on desktop / collapsible groups on mobile):
  - **Publication link:** "DOI Link" (UGS/UGMS) or "Publication Page" (others) —
    the existing publisher‑aware logic.
  - **Downloads:** PDF · GIS data · GeoTIFF · Cross‑section · Purchase — only the
    ones present for that map; each an icon + label (see Icon reuse). Cross‑
    section opens the existing image viewer (`#xsection-pane`).
  - **Citation:** the `reftxt` string (author[, and sec_author], year, name,
    series_id, publisher, scale) with a copy‑to‑clipboard control.
  - **Map tools:** Pan to · Zoom to (the map's footprint extent) · Copy shareable
    link · Preview (thumbnail from `pub_thumb`).

### `units!=='True'` (publication‑only; no unit description)

- No left description column → the section leads with the resources (downloads
  are the point). Keep the short note "Tabular GIS data has not been generated
  for this map; see the publication." + the publication link, then Downloads /
  Citation / Map tools as above.
- On desktop this is effectively a single wide resources block (no 2‑col split).

### "Other maps at this location"

- Unchanged structure: a single‑open accordion of collapsed headers below the
  primary. Opening one gives it the same responsive section body. The clicked
  map remains the default‑open primary on top.

## Functions carried over from the Map Downloads card

| Card function | New home | Source |
|---|---|---|
| Publication page title link | Resources → publication link | derived (publisher) |
| PDF | Downloads | `getData.pub_url` |
| GIS data | Downloads | `getData.gis_data` |
| GeoTIFF | Downloads | `getData.geotiff` |
| Cross‑section (+ viewer) | Downloads (opens `#xsection-pane`) | `getData.x_section` |
| Purchase | Downloads | `utahmapstore.com/products/<series_id>` (gated by `bsurl`) |
| Citation (+ copy) | Resources → citation | `reftxt` (reuse, incl. sec‑author join) |
| Preview image | Map tools → Preview | `getData.pub_thumb` |
| Shareable link | Map tools | existing `?view=scene&sid=…&layers=…` + `copyToClipboard` |
| Pan to / Zoom to | Map tools | footprint feature extent |
| Footprint highlight | automatic on section open/hover | footprint geometry |
| Pin / "list maps on screen" | dropped | already hidden today |

## Icon reuse

Reuse the existing download glyph classes from the card (`pdfIcon`, `gisIcon`,
`tiffIcon`, `xsecIcon`, `purIcon`) and the existing tool/share icon styles so the
consolidated panel matches the app and needs **no new assets**. The cross‑section
download reuses the current `#xsection-pane` viewer wiring.

## DOM / CSS approach

- Extend `buildAccordion()` section markup to emit the resources block. New
  containers (illustrative class names): `.readout-resources` (the rail/groups
  wrapper), `.readout-downloads`, `.readout-citation`, `.readout-tools`, plus
  disclosure groups `.readout-group[aria-expanded]` for the mobile collapsibles.
- Responsive layout via a CSS grid on the open section body
  (`grid-template-columns: 1fr` mobile → `minmax(0,1.4fr) minmax(165px,1fr)`
  desktop) behind the 768px media query. The mobile collapsibles are hidden
  on desktop (the rail shows the same content expanded) — same content, CSS
  controls presentation.
- Remove the nested `vh` scroll caps introduced for the pinned layout; make
  `#unitsPane` the single scroller; make the header sticky.
- Keep all rendering in `mapcontrols.js`/`style.css` (the established single‑file
  pattern); no framework, no build.

## Data fetching

- Extend `prefetchPubData()` to warm `getData` for **all** footprints at the
  point (not just `units!=='True'`), since every section now shows
  downloads/citation. `getData` already accepts batched `mapid`s and the result
  is memoized by `series_id`.
- The DOI/Publication‑Page link renders immediately from `series_id` +
  publisher; file downloads/citation/preview render when the (prefetched)
  `getData` record resolves.
- Reuse the citation builder (the `pub_author` + smart‑"and" `pub_sec_author`
  join already added in PR #144) — extract it into a small shared helper so both
  the readout and (temporarily) `printPubs` use one implementation.

## Accessibility & polish ("make it awesome")

- Disclosure groups are real buttons with `aria-expanded`/`aria-controls`;
  keyboard operable; visible focus rings (the accordion already does this).
- Smooth height/opacity transitions on expand/collapse and on the description
  "Show more".
- Crisp typography hierarchy: section header (Bebas) > unit identity (the smaller
  weight from PR #144) > body; downloads as scannable icon+label rows; citation
  in a muted, monospace‑free small style with an obvious copy affordance.
- Loading and empty states per section (spinner while `getData` resolves;
  graceful "no downloads available" when a map has none).
- Respect `prefers-reduced-motion` for the transitions.

## Retiring Map Downloads (sequenced follow‑up — not this spec's build)

Once a consolidated section reaches parity with the card (verified on the dev
site), a small follow‑up removes the `#identifyPanel` toggle,
`toggleUnitDesc()`/`toggleMapDl()`, the `#mapsPane` Swiper, and `printPubs()`,
and makes the readout the single experience. Kept separate so we don't delete the
card until parity is proven, and so the footprints‑layer / scale‑filter‑button
handling can be addressed with the layer‑list reorg. The citation's only other
home is the readout, so it must be live there first.

## Tech constraints

- Vanilla JS (ArcGIS Maps SDK + jQuery), Firebase Hosting + Cloud Functions,
  pg_featureserv, AGOL footprints. No new runtime dependency. No build step.
- `node --check public/mapcontrols.js` must pass; CSS brace‑balanced.

## Testing (manual — no frontend test runner in this repo)

Verify on the **dev site** (auto‑deploys from `dev`); local `firebase serve`
can't render the secured ArcGIS geology layers (see auto‑memory). Cases:
- Desktop ≥768px: two‑column section; full description; rail shows publication
  link + downloads + citation (copy works) + tools (pan/zoom/share/preview);
  single scrollbar; sticky header/close.
- Mobile <768px: bottom sheet; one column; description truncates with Show
  more; resources collapse into groups; single scrollbar.
- A `units==='True'` map (e.g. `M-300DM`): description + DOI Link + downloads.
- A `units!=='True'` UGS/UGMS map (`Q-2thru5`): Publication‑only note + DOI Link
  + PDF/GeoTIFF + citation incl. secondary authors.
- A non‑UGS map (`I-2462`, USGS): Publication Page (not DOI) + whatever
  downloads exist.
- Multiple maps at a point: accordion of others; opening one renders the same
  responsive body; clicked map stays the default‑open primary.
- Zoom Chrome to ~150–175%: nothing clipped; one scrollbar.

## Decisions (resolved)

- Density: compact, progressive disclosure.
- Responsive: columns on desktop / stacked + expanders on mobile, 768px.
- Description: full on desktop, truncate on mobile.
- Panel: ~440px desktop / full‑width bottom sheet mobile; opacity → 0.96.
- Scroll: single container + sticky header.
- Drag‑to‑resize: optional stretch, not required for parity.
- Map Downloads removal: sequenced follow‑up after parity.

## Open questions

- None blocking. (Exact desktop width, rail ratio, and truncation line‑count are
  tunable during implementation against the dev site.)

## Risks

- Two readout render paths (`loadUnitDescription` / `loadPublicationOnly`) must
  both adopt the resources block without regressing the existing description /
  500k / Macrostrat / out‑of‑state paths.
- Prefetching `getData` for all footprints slightly increases requests at click
  time (bounded by # maps at a point; memoized) — acceptable.
- The footprint feature geometry must be retained through `accordionFtrs` for
  pan/zoom/extent; confirm `returnGeometry` on the click query during
  implementation.
- This is throwaway at migration — keep it contained; resist scope creep into the
  layer‑list reorg.

## Self‑review

- Spec coverage: consolidated section (anatomy, both `units` paths), responsive
  columns + disclosure, single‑scroll + sticky header, function parity table +
  data sources, icon reuse, prefetch extension, citation helper extraction,
  a11y/polish, retirement sequencing, testing, constraints. Covered.
- Placeholders: none.
- Consistency: 768px breakpoint, ~440px width, 0.96 opacity, and the single‑
  scroll model are stated once and reused; function table maps every card
  feature to a home + source.
- Scope: focused on the consolidated readout + scroll; layer‑list reorg and the
  actual card removal are explicitly deferred.
