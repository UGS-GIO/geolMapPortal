# Unit Description Source Gating — Design

- Date: 2026-05-29
- Status: Approved (pending spec review)
- Area: `public/mapcontrols.js` + AGOL `Geologic_Map_Footprints_View`

## Problem

The unit-description panel shows a description for every clicked geologic unit. For
maps that were **not** originally published with unit descriptions in their attribute
tables, or that did not publish vector GIS at all, the description currently shown was
transcribed by UGS staff (from the PDF, or from an internal GIS database). We want to
**hide** those descriptions and instead point users to the official publication
(PDF + DOI). Descriptions should show **only** when they came from the map's published
GIS database. This must not require maintaining a side spreadsheet going forward.

## Decision: the rule

Show the unit description **iff** the map's "unit description source" is
`Published GIS Database` (encoded on the footprint as `show_unit_desc = true`).

Verified against `geolmap_portal_delineation.csv` (139 maps): this is exactly
equivalent to `Vector GIS Published == TRUE AND Tabular GIS Altered == FALSE`
(0 mismatches). Counts: 60 show; 79 hide (71 `Copied from PDF`, 7 `Internal GIS
Database`, 1 `Both`). The 7 internal + 1 both fall to hide, matching the
"didn't publish the vector GIS" criterion.

## Why the footprints layer is the authoritative home

The provenance bit is **not derivable** at runtime. The two runtime sources expose
no source field:

- **Footprints** (`Geologic_Map_Footprints_View/FeatureServer/0`, `mapcontrols.js:684`):
  `quad_name, units, resturl, series_id, scale`.
- **pg_featureserv** `postgisftw.unit_desc_sym_age_by_point_scale` (`:2163`) — live
  schema returns only `unit_name, unit_description, unit_symbol, age, import_date`.

The distinction (was the description as-published, or transcribed?) is a provenance
fact that cannot be recovered from description text, geometry, scale, or the
publications DB. Today it lives only in the manual CSV. Therefore *one bit per map*
must be recorded somewhere the portal reads at runtime; it cannot be inferred.

The footprints layer is the chosen home because:

- It is keyed per-map by `series_id` — the exact granularity of the decision.
- The portal already has the footprint feature (`atts`) in hand inside
  `getUnitAttributes` (`:2147`), so the show/hide decision is local — no extra request.
- UGS already populates `series_id`/`units`/`scale` per map on this layer, so tagging a
  new map is part of an existing workflow, not a new spreadsheet.

## Design

### Data changes (AGOL — UGS side)

1. Add one boolean field `show_unit_desc` to the footprints source layer (the view
   inherits it): `true` = description came from the published GIS database → show;
   `false`/null = hide.
2. One-time backfill: set `show_unit_desc = true` for the 60 maps where the CSV's
   "Unit Description Source" == `Published GIS Database`. The other 79 stay null/false
   (both hide), so only 60 updates are needed. A `series_id` list of those 60 "show"
   maps will be generated from the CSV during implementation, plus a list of any
   `series_id` values that do not match between the CSV and the footprints layer
   (the code already warns these mismatches exist — `:2296`).
3. Going forward: set `show_unit_desc = true` only when registering a new map whose
   descriptions come from its published GIS database; otherwise leave it unset.

### Code changes (`public/mapcontrols.js`)

4. Add `show_unit_desc` to the footprints `outFields` at `:1980` (the unit-description
   query path; essential) and to the layer definition `outFields` at `:686`.
5. In `getUnitAttributes(atts, scale, evt)` (`:2147`), after the pg_featureserv result
   resolves, branch on `atts.show_unit_desc`:
   - true → existing rendering (show the description).
   - otherwise (`false`/null/unknown) → **hidden treatment** (default-hide).
   - The `scale === '500k'` statewide path keeps its existing generic message
     (`:2175`) unchanged; gating applies only to non-500k.
   - Confirm the JSON type the view emits for the field during implementation: a true
     Boolean returns `true`/`false`; if the layer instead uses the existing `units`
     string convention (`'True'`/`'False'`), the check becomes `=== 'True'`. The code
     will match the actual emitted type, defaulting to hide on anything non-true.
6. PDF link: add a side-effect-free helper `getPubUrl(seriesId)` that fetches
   `${projectName}/getData?mapid=<seriesId>` (`projectName` = `:51`) and returns
   `data[0].pub_url`. Do **not** reuse `getData` directly — it calls `printPubs` and
   would render the downloads panel as a side effect (`:2234`).

### Hidden-panel UI

Keep the unit identity line `UnitSymbol: UnitName (UnitAge)` from pg_featureserv.
Replace the description paragraph with a short note and links, e.g.:

> Unit descriptions for this map are available in the original publication:
> [PDF](pub_url) · [DOI](https://doi.org/10.34191/<series_id>)

Reuse existing link styling where possible (e.g. `.pdfDown` / `.pdfIcon`, used in the
downloads panel at `:2409`).

## Edge cases & error handling

- **Default-hide**: anything other than an explicit true (`false`/null/blank) hides the
  description. This protects against ever surfacing an un-vetted description; it requires
  the 60 "show" maps to be backfilled before/with the code deploy (see Rollout).
- **pg_featureserv returns no row**: the existing code reads `results.data[0]` without a
  guard. For the hidden branch, if no unit is returned, render the links with a generic
  "see the publication" note instead of throwing. (Hardening the show branch's missing
  guard is optional and out of scope.)
- **PDF fetch fails / no `pub_url`**: still show the DOI link and the identity line;
  surface no description. Never show a broken/empty description in place of the links.
- **series_id mismatch** between CSV and footprints: surfaced as a reconciliation list
  during backfill; unmatched maps stay default-hide until corrected.
- **500k statewide** and **Macrostrat (out-of-Utah)** paths: unchanged, out of scope.

## Rollout / sequencing

Because of default-hide, the AGOL field + backfill of the 60 "show" maps must land
**before or with** the code deploy; otherwise descriptions are hidden portal-wide until
backfill. Sequence: (1) add field + backfill in AGOL, (2) deploy `mapcontrols.js`
changes. The change is effectively data-gated, so it can be staged on dev first.

## Testing

- Manual: click a known **show** map (e.g. `M-300DM` Duchesne, `OFR-771DM` Blanding
  North) → description renders as today. Click a known **hide** map (e.g. `M-180DM` Moab,
  `OFR-454` Beaver) → identity line + PDF + DOI links, no description.
- Untagged/blank `show_unit_desc` → hidden treatment (default-hide).
- 500k statewide click → unchanged generic message.
- Out-of-Utah click → Macrostrat path unchanged.
- `getPubUrl` does not render or disturb the downloads panel.

## Out of scope

- Hiding/altering unit **name**, **symbol**, or **age** (only the description is gated).
- Changing the 500k or Macrostrat behavior.
- Migrating the provenance bit into PostGIS/pg_featureserv (footprints layer chosen).
- Automating provenance capture in the data-ingest pipeline (not derivable; recorded
  per-map at footprint registration).

## Appendix: show-list source of truth

`geolmap_portal_delineation.csv`, column `Unit Description Source == 'Published GIS
Database'` (60 maps). Backfill sets `show_unit_desc = true` for those `series_id`s; all
others stay null/false (hide).
