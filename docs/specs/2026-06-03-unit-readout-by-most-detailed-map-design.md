# Unit Readout by Most-Detailed Map — Design

- Date: 2026-06-03
- Status: Approved (design locked in conversation)
- Supersedes: `2026-05-29-unit-description-source-gating-design.md` (the `show_unit_desc`
  approach is reverted — see Revert below)
- Area: `public/mapcontrols.js`

## Why this replaces the gating approach

The footprints layer already has a per-map `units` (T/F) field meaning "this map has
queryable digital unit descriptions." UGS has since set every copied-from-PDF map to
`units=False`, so the publishable-vs-copied distinction that `show_unit_desc` encoded no
longer exists in the data. The real goal is a better click readout driven by `units` plus
map scale.

## Behavior: one click → the most-detailed visible map's readout

Toggles gate the readout (only maps whose scale-layer is toggled on are eligible). Among
the eligible footprints at the click point, pick the **most-detailed** one (smallest
scale number) **regardless of `units`**, and render its own readout:

1. Most-detailed visible map has **`units=True`** → **full description** (unit
   symbol/name/age + text + DOI) — unchanged from today's `getUnitAttributes`.
2. Most-detailed visible map has **`units=False`** → **"Publication only"** panel:
   *"Tabular GIS data has not been generated for this map; see the publication."* + links
   (below). A coarser `units=True` map does **not** override this.
3. No visible footprint at the point → Macrostrat description if the 2500k layer is on;
   else just the "Other maps here" section (replacing the old "turn on less-detailed
   layers" message).

In **all** cases where other footprints cover the point, append an **"Other maps here"**
section so the user learns what else (and at what scale) is available.

### "Other maps here" section

For each footprint at the point other than the one shown as primary, list:
`<scale label> · <quad/map name> · <"descriptions" if units=True | "publication only" if
units=False>`. For any whose scale-layer is currently **off**, render a **"Turn on"
control** that enables that scale and re-runs the readout. This is how the user discovers
that, e.g., 1:100,000 descriptions exist beneath a 1:24,000 publication-only map.

### Publication-only links (`units=False`)

Fetch the map's publication record (side-effect-free `getData`): `pub_url` (PDF),
`geotiff` (if present), `pub_publisher`. Render:

- **Publication page** — for UGS/UGMS publishers: `https://doi.org/10.34191/<series_id>`
  (resolves to the UGS publication page). For non-UGS/UGMS publishers (`pub_publisher`
  is anything else): the database `pub_url` (no DOI/UGS page). *(Assumption, easily
  changed: non-UGS "publication page" = `pub_url`.)*
- **GeoTIFF** — `geotiff` URL, only if present.
- **PDF** — `pub_url`.

If no publication record is found for the `series_id`, show the message with no links.

## Components (all in `public/mapcontrols.js`)

- **`fetchAttributes(ftrset, evt)`** (`:2050`) — rewrite. Today it filters to
  `units==='True' && isVisible(scale)` and renders the first. New: filter to
  `isVisible(scale)` only, sort most-detailed first, take `[0]` as the primary; branch on
  its `units`; then call the "Other maps here" renderer with the rest. Keep the
  Macrostrat / no-map fallbacks.
- **`getUnitAttributes(atts, scale, evt)`** (`:2147`) — revert the `show_unit_desc`
  branch; restore the original description rendering. Keep the null-`unit` guard (good
  fix) and the `unitClickSeq` race guard (still used by async renders).
- **`getPubData(seriesId)`** — generalize the PR123 `getPubUrl`: fetch
  `${projectName}/getData?mapid=<id>` once and return `{pub_url, geotiff, pub_publisher}`
  (no `printPubs` side effect).
- **`renderPublicationOnly(footprintAtts)`** — repurpose PR123 `renderHiddenUnit`: show
  the map name + the message + the links above, with the `unitClickSeq` guard.
- **`renderOtherMaps(otherFootprints)`** — new. Builds the "Other maps here" list with
  per-scale "Turn on" controls.
- **Toggle action** — a control calls the existing layer path: set the scale checkbox
  `checked = true` and dispatch a bubbling `change` event so `$("#layersPanel").change`
  (`:1080`) runs `addMaps([id])` (`:835`) + raster + `activateLayers()`; then re-run the
  readout.
- **Re-run readout** — store the last readout inputs (`lastUnitFtrset`,
  `lastUnitClick = evt`) and a `rerunUnitReadout()` that re-runs `fetchAttributes` against
  the cached footprints (a toggle changes only layer visibility, not which footprints
  cover the point). The toggle action calls it after enabling the layer.
- **`outFields`** — remove `show_unit_desc` from `:686` and `:1980` (revert PR123).
- **Scale label helper** — map scale number → label (24→"1:24,000", 25-249→"Intermediate
  (1:100,000)", 500→"1:500,000", 2500→"U.S. (Macrostrat)").

## Revert of PR 123

`show_unit_desc` is no longer used: remove it from both `outFields` lists and remove the
gating branch in `getUnitAttributes`. The two renderers I added are kept and repurposed
(`getPubUrl`→`getPubData`, `renderHiddenUnit`→`renderPublicationOnly`). The AGOL
`show_unit_desc` field and `docs/plans/backfill-show-unit-desc.md` become obsolete
(field can be deleted; doc removed or marked superseded).

## Edge cases

- **500k statewide** keeps its existing "only symbol/name at this scale" message inside
  the `units=True` description path.
- **Most-detailed visible map is `units=False`, no publication record** → message only,
  plus the "Other maps here" section.
- **No publication PDF / GeoTIFF** → render only the links that exist; never a broken link.
- **Toggle re-run** respects `unitClickSeq` so a stale async render can't clobber the
  refreshed panel.
- **Macrostrat / out-of-Utah** unchanged.

## Out of scope

- Per-map (vs per-scale) layer toggling — toggles operate on the whole scale layer, as the
  layer manager already does.
- Changing how `units` is populated (UGS owns that in AGOL).
