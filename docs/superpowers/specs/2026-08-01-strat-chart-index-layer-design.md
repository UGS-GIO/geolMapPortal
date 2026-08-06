# Stratigraphic Chart Index Layer — Design

- **Jira:** ALL-5470 (epic ALL-2225, Next Release — Geologic Map Portal)
- **Date:** 2026-08-01
- **Repos:** `geolMapPortal` (layer), `ugs-ingest` (pipeline upload)

## Problem

*Geologic History of Utah: A Field Guide to Utah's Rocks* (Hintze & Kowallis, 2nd ed.,
2021) contains 123 numbered stratigraphic charts, indexed by a map of Utah showing where
each chart applies. Both the index map and the chart images exist only as images. Nothing
about them is queryable, and nothing connects them to the Geologic Map Portal, where users
are already looking at the geologic maps these charts supplement.

This design publishes the charts as a portal layer: a point per locality, the chart image
in the popup, a link back to the bookstore, and — the part the book itself cannot do —
the charts' stratigraphic content as structured, filterable data.

## Rights

Use of the content is permitted by the BYU Department of Geological Sciences (confirmed
by Marshall Robinson, 2026-08-01). The book remains for sale; every popup links to it.

## Source material

| input | location | notes |
|---|---|---|
| index map | `temp_data/IMG_4168.HEIC`, `IMG_4167.HEIC` | two hand-held photos of the same page |
| chart images | `temp_data/drive-download-20260801T222738Z-1-001/` | 128 JPEGs, ~1100 × 2800 px |

**Coverage verified:** all chart numbers 001–123 are present. Five numbers (018, 019, 021,
071, 072) have duplicate file variants suffixed `" 2"` / `" 3"`; in every case the
un-suffixed file is the newer revision by mtime, so the suffixed variants are dropped.
That leaves 123 canonical images.

**Chart 70 is not a stratigraphic chart.** Its title reads "UINTA BASIN MAPS & CROSS
SECTION" — it is a plate, with no unit table. It still gets a locality point, typed
`map_cross_section`, and contributes no unit rows. So: 123 localities, 122 charts with
unit content.

It is otherwise a **full member of the layer**: same point, same popup, same image and
thumbnail, same citation and purchase link. Its plate is 1099 × 2773 px, the same aspect
as the charts, so it needs no special handling in thumbnail generation or the fancybox
viewer. The only difference that ships today is `chart_type = 'map_cross_section'`; once
the deferred unit-derived columns land it will also carry `unit_count = 0` and null
period bounds, and simply never match a unit-based filter. Nothing in the popup path
branches on chart type.

**Three competing names per chart.** Filename, index-map label, and the title printed on
the chart image disagree — chart 72 is `072_UintaBasin.jpg`, labelled "Ouray" on the index
map, and titled "UINTA BASIN NEAR OURAY" on the chart itself. **The chart image title is
authoritative.** The other two are retained as provenance columns, not discarded, because
they are how someone holding the book or the file listing will search.

## Data model

Two topics through the ingest pipeline, joined on `chart_id`. `ugs-ingest` handles
non-spatial CSVs as first-class input (`geoparquet-conversion/CSV_PROJECTION_GUIDE.md:141`)
and supports declared foreign keys, so this is the pipeline's native grain rather than a
workaround.

### `strat_chart_localities` — 123 rows, spatial

| column | type | notes |
|---|---|---|
| `chart_id` | int | PK, 1–123 |
| `chart_title` | text | from the chart image — authoritative |
| `index_label` | text | as printed on the index map |
| `source_filename` | text | provenance |
| `chart_type` | text | `stratigraphic_column` \| `map_cross_section` |
| `longitude`, `latitude` | double | WGS84 |
| `state` | text | UT, and ID/NV/CO/AZ for the border charts |
| `image_url` | text | full chart in Firebase Storage |
| `thumbnail_url` | text | popup-sized derivative |
| `oldest_period`, `youngest_period` | text | **DEFERRED** — derived from the unit rows |
| `unit_count` | int | **DEFERRED** — derived; 0 for the plate |
| `position_uncertainty_m` | double | total positional uncertainty — see below |
| `source_title`, `source_authors`, `source_year`, `source_publisher` | text | citation |
| `source_series` | text | **nullable** — see Open questions |
| `source_url` | text | bookstore product page |

`position_uncertainty_m` travels with the data on purpose: uncertainty that lives only
in a README is uncertainty nobody downstream can act on. It carries the **total**
figure, dominated by the book's own label placement — **not** the georeference residual,
which is roughly 300× smaller (18,000 m against 59.9 m) and would badly misrepresent
what a pin means.

### Deferred columns

`oldest_period`, `youngest_period` and `unit_count` are **not in the shipped table.** All
three are aggregates over `strat_chart_units`, and that extraction is archived unvalidated
at `tools/strat-charts/unit-extraction/` rather than published — it is single-pass, with a
measured agreement rate on only 99 of its 4,343 rows.

They are kept in this schema rather than deleted because they come back cheaply once the
unit rows are validated: each is a plain aggregate over the child table, needing no new
source reading. **Anything consuming the locality table today must treat them as absent,
not as null-because-unknown** — the distinction matters, because a null would imply the
value was looked for and not found.

### `strat_chart_units` — ~4,500 rows, tabular

> **Status: extracted but not published.** 4,343 rows exist at
> `tools/strat-charts/unit-extraction/`, single-pass and unvalidated. This schema
> describes the intended table; the archive documents what was actually produced
> and what is known to be wrong with it. The two differ — the archive adds
> `unit_name_normalized`, `column_variant`, `is_banner` and `note_spans`, all of
> which the extraction proved necessary and none of which were anticipated here.

| column | type | notes |
|---|---|---|
| `chart_id` | int | FK → `strat_chart_localities.chart_id` |
| `unit_seq` | int | 1..n, top to bottom; preserves stratigraphic order |
| `erathem`, `period` | text | from the spanning left-hand column |
| `parent_unit` | text | for nested units, e.g. `Twin Creek Ls` |
| `unit_name` | text | formation |
| `member_name` | text | nullable |
| `thickness_text` | text | **verbatim**, e.g. `0-north 4000-south` |
| `thickness_min_ft`, `thickness_max_ft` | int | parsed, nullable |
| `lithology_pattern` | text | from the swatch column |
| `notes` | text | verbatim right-hand column |
| `qa_flag` | text | nullable; set on any failed check or pass disagreement |
| `qa_source_bbox` | text | pixel box of the source cell, for review |

Two structural facts drove this shape. The period column is a **spanning cell** — one
period covers many rows — and units **nest** (`Twin Creek Ls` → `Giraffe Creek Mbr`),
hence `parent_unit`. Thickness is stored both verbatim and parsed: parsing is lossy on
entries like `0-north 4000-south`, and the source text is not discarded to make a number
look tidy.

## Georeferencing

**The map is drawn in a conic-style projection**, which was not anticipated and which
invalidated the original corner-based plan. Measured E–W width between the Nevada and
Colorado meridians grows from 2228.7 px at ~40.6°N to 2313.7 px at ~37.8°N — a ratio of
0.9632 against a cos-latitude prediction of 0.9604, versus 1.0000 for plate carrée.
Meridians converge and parallels are arcs, so the boundary edges are not straight lines
*in the source*, independent of any page curvature. No number of corner control points can
express a projection, and re-photographing the page flat would not have helped.

The approach that works treats the drawn boundary not as a shape to fit but as a dense,
exactly-known deformation field: every point on the south edge is at latitude 37.0 by
definition, every point on the Nevada edge at longitude −114.0506389.

1. Boundary coordinates derived from the Utah statute — which defines its meridians *west
   from Washington* — converted to Greenwich via USGS Professional Paper 909's value of
   77°03′02.3″. Nominal rather than surveyed, because the source is a schematic drawing.
2. Trace all six drawn rules and emit a control point every few pixels, assigning geography
   by arc-length fraction. That is *exact* for longitude along a parallel in a conic.
   Yields **292 control points** rather than six.
3. `gdal_translate -gcp` → `gdalwarp -tps`, which now absorbs projection and page
   distortion together.
4. Accuracy measured two independent ways: leave-one-out over the 292 control points, and
   check points against USGS GNIS town coordinates.
5. Digitize each numbered label anchor **on the source raster**, transforming through the
   TPS. The warped output has its own pixel grid; mixing the two frames produced a 27–124 km
   error during development, so the pipeline holds one coordinate system end to end.

**Boundary ink coverage is uneven and permanently so** — north 64%, Wyoming 68%, 41st
parallel 87%, Colorado 95%, south 86%, Nevada 88%. Every gap is a place where the
cartographer broke the rule to fit a label ("Bear Lake/Crawford", "Albion/Strevell/Curlew",
"St. George"). Control is strongest along the Colorado meridian and weakest across the
north.

**Deliverable of this phase is the residual table and a QA overlay** of all 123 pins on a
real Utah basemap. If the warp is bad it will be visible in numbers before any extraction
effort is spent.

### Measured result

The georeference passed; the source's own precision is the binding limit.

| measurement | samples | result |
|---|---|---|
| leave-one-out over 292 perimeter GCPs | the boundary, where all control sits | median **10 m**, RMSE **60 m**, max 547 m |
| check points vs USGS GNIS | 18 interior towns | median **13.2 km**, RMSE **18.0 km** |

The gap is not a defect. The index map carries **no locality dot** — each chart's number
*is* its mark, placed where it sits legibly inside the region the chart covers. So the
13 km is how far the book prints a number from the place it names, and georeferencing
reproduces that faithfully, looseness included.

That the residual is label placement rather than warp error was established three ways:
the mean residual is (+0.53, +2.17) px against a 96.8 px scatter (t = +0.03 and +0.13,
threshold ≈ 2.1); position dependence is not significant (corr(dy, py) = +0.444,
t = +1.98, falling to +0.295 / t = +1.15 once two known-offset glyphs are excluded); and
the two worst points are printed "Vernal **NW**" and "Monticello-**Bluff**", labels that
name a point away from the town.

**Interior support is bounded, not measured.** Every control point lies on the boundary;
the interior is a minimum-bending-energy surface between them. No interior bias is
detectable and it is bounded at roughly ±3.4 km, but that is an absence of signal — the
check points cannot resolve below 13–18 km. Interior control from drawn features (lake
shorelines, river confluences) would settle it, and was scoped out deliberately because
it would not reduce the 13 km label offset, which is what actually governs a pin.

**Consequence for the layer:** a pin means *"the chart covering this area"*, never *"this
exact point"*. The popup names the chart, so a user reading "Chart 113 — MOAB" is being
told the truth. Anything in the portal that implies point precision — a small marker at
high zoom, a "nearest chart" search — would be overclaiming.

## Extraction and QA

Table rules are machine-detectable, verified on sample charts:

| chart | column rules (px) | data rows detected |
|---|---|---|
| 034 Salt Lake | 1, 77, 440, 590, 1083 | 43 |
| 105 Zion Park | 1, 83, 489, 633, 1085 | 54 |
| 113 Moab | 4, 82, 440, 589, 1088 | 46 |
| 069 Uinta Basin | 1, 74, 435, 578, 647, 1085 | 30 |

This is what makes accuracy achievable: **cells are cropped and read in isolation**, not
inferred from one 2,800-px image. Reading a whole chart at once is where rows get silently
merged or dropped; per-cell crops driven by detected rules make that failure mode nearly
impossible, and the geometric row count is an *independent* check on whether a unit went
missing.

Per chart: detect rules → crop cells → read each in isolation → **two independent
passes** → diff. Then:

- **row count** — extracted rows vs geometric rule count
- **period monotonicity** — the period column must follow the geologic time scale downward
- **cross-chart lexicon** — formation names pooled across all 122 charts; singletons and
  near-duplicates (`Gardison` vs `Gardison Ls`) flagged
- **thickness sanity** — min ≤ max, magnitude outliers flagged

Any failed check or inter-pass disagreement sets `qa_flag`. **Nothing is silently
accepted.** Output includes a QA sheet pairing each chart image with its extracted table.

### Expected accuracy

Stated plainly because it should not be overclaimed:

| field | expectation | why |
|---|---|---|
| period / erathem | effectively perfect | small fixed vocabulary, colour-coded, monotonic — violations are auto-detectable |
| formation / member | very high | strong domain priors, names recur across charts, lexicon catches typos |
| thickness | **weakest** | no semantic prior; only a second independent read catches a digit slip |
| notes | good | freeform, highest variance |

Residual cell errors after two passes and the checks above are expected in the low tenths
of a percent of ~20,000 cells, concentrated in thickness and notes, plus a flagged review
list. This is not a claim of perfection. The guarantee is that errors are **visible**:
flagged, reviewable, and traceable to a source crop.

## Images

The 123 canonical JPEGs upload to `strat-charts/` in
`ut-dnr-ugs-geolmapportal-prod.appspot.com` — the bucket the portal already uses
(`public/index.html:32`). Thumbnails are generated for the popup; full-size images average
~1.3 MB, too heavy to load inline.

## Portal layer

Branch `feat/strat-chart-index-layer` off `master`, PR back to `master`. `master` is what
is live (`.github/workflows/firebase-hosting-merge.yml` deploys on push to it), and
feature branches get an ephemeral Firebase preview channel automatically — the preview
workflow skips only `dev`→`master` PRs and Dependabot.

The portal is ArcGIS JS API 4.29 and already consumes the Postgres serving layer through
pg_featureserv (`postgisftw.*` functions, `public/mapcontrols.js`). The new layer is a
`GeoJSONLayer` over a pg_featureserv collection — the existing grain, no new
infrastructure.

### Popup

```
[ chart thumbnail ]   ← click → full chart in fancybox (already bundled)

Chart 34
Salt Lake City – Wasatch Range
────────────────────────────
SOURCE                              ← ~10px, letterspaced, muted
Hintze, L.F., and Kowallis, B.J.,   ← ~11px, muted
2021, Geologic history of Utah:
A field guide to Utah's rocks
(2nd ed.): Provo, Utah, Department
of Geological Sciences, Brigham
Young University, 266 p.

Available from the Utah Map Store → ← the only link
```

The citation is an obligation: complete and correct, but visually subordinate to the
chart. The purchase link is the intended action, so it carries normal weight and is the
**single** link in the block — two links to the same destination split attention and make
neither authoritative. Exact type scale and colour are set against the portal's existing
popup CSS during implementation, not invented in isolation.

**Every one of the 123 localities gets this popup**, including chart 70. There is no
chart-type branch in the popup path — a locality with no unit rows still shows its image,
title, citation, and purchase link, because the image is the deliverable and the plate is
as much a part of the book as the columns are.

The unit rows are deliberately **not** rendered in the popup. The chart image already is
the unit table, typeset with lithology swatches and colour-coded periods; re-rendering it
as HTML is a strictly worse version of the same information plus a maintenance surface. A
screen-reader text alternative is added, since an image alone is invisible to assistive
technology.

### Filtering

The unit rows exist to answer questions the book cannot: *which charts contain the Nugget
Sandstone?*, *which show Cambrian?* A `postgisftw.strat_charts_by_unit(...)` function
returns matching locality points, matching the established
`autocomplete_pat_match` / `query_unit_name_envelope` pattern in `mapcontrols.js`.

Filters: unit/formation name (autocomplete), period, region.

## Phases and gates

| phase | output | gate |
|---|---|---|
| 0 | georeferenced index map, 123 pins, residual table, QA overlay | **PASSED** — warp 10 m median; 13 km label placement accepted as the source's own precision |
| 1 | 5-chart pilot with full QA machinery | **measured error rate reviewed before the remaining 117** |
| 2 | all 122 charts extracted, QA sheet | flagged cells reviewed |
| 3 | two ingest-ready CSVs | uploaded via the ugs-ingest app |
| 4 | portal layer, popup, filters | PR to `master` via preview channel |

Phases 0 and 1 exist because the two expensive risks — a bad warp and an unacceptable
extraction error rate — are both cheap to measure early and ruinous to discover late.

## Risks

- **`master` / `dev` divergence.** `dev` holds ~30 unmerged commits including a click-readout
  redesign (`feat(readout): consolidate downloads, citation, and tools into the click
  readout`). That is the same popup machinery this work touches, so a conflict is likely
  when `dev` merges. Building on `master` is correct — it is what is live — but whoever
  owns the readout branch should know.
- **Thickness transcription** is the weakest field and the one with no automated
  cross-check beyond a second pass. Flagged cells will concentrate here.
- **Georeference quality** is capped by the source photograph. Phase 0 exists to measure
  it before anything depends on it.

## Open questions

- **Series/publication number.** The 2009 first edition is *BYU Geology Studies Special
  Publication 9* (confirmed, Penn State Libraries catalog). The 2021 second edition's
  number is not on the bookstore page and not in any reachable catalog; NGMDB returns 403.
  A page-footer fragment suggests "Publication 10" but is not legible enough to publish.
  `source_series` is nullable so it can be filled in without a migration. The BYU contact
  who granted permission can confirm it.
- **`geolMapPortal` is missing from `repo-epic-map.json`.** ALL-5470 was parented by hand.
  Add `"geolMapPortal": "ALL-2225"` to both `agents-config/repo-epic-map.json` and the
  `repoEpicMap` variable in the *Github to Jira Flow* automation rule.
