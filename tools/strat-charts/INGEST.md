# Loading the locality table through the ugs-ingest pipeline

Notes for taking `data/strat_chart_localities.csv` (123 rows, 18 columns) through
the ingest app and repointing the portal layer at the serving table. ALL-5470.

## Upload settings

| setting | value |
|---|---|
| workflow | new_table |
| geospatial | **yes** |
| CRS / EPSG | **4326** |
| longitude column | `longitude` |
| latitude column | `latitude` |
| primary key | `chart_id` (verified unique, 1–123 with 70 present) |

## Checked before upload

- **All 18 column names are already snake_case.** Sanitization will not rename
  anything, so the field names the popup reads survive the round trip unchanged.
  This is the failure that would matter most — see "Repointing the layer" below.
- No value exceeds 255 characters; the longest is a 162-character image URL.
- `chart_id` is unique across all 123 rows.
- Commas appear inside `chart_title`, `source_authors` and `source_publisher`;
  standard CSV quoting covers it, but do not hand-edit the file with a tool that
  rewrites quoting.

## Two things to decide at upload time

**1. `source_series` is empty on all 123 rows.** It is a placeholder for the BYU
publication number, which is not established (see the design spec's Open
questions). Type inference has nothing to work from and will guess. Either:
- drop the column and re-add it when the number is confirmed, or
- declare it explicitly as text so it lands as an empty text column rather than
  whatever the inferencer picks.

The second is preferable — it keeps the schema stable and the popup's citation
block does not read the field yet.

**2. The file contains 68 en-dashes (U+2013), all in `chart_title`.** They are
correct — the book prints "Curlew Valley – Sublette Range, Utah–Idaho" with en
dashes, and `chart_title` is verbatim from the chart. The file is valid UTF-8.
Confirm the ingest path preserves them rather than mangling to `?` or `â€"`;
if it does not, that is a pipeline encoding bug worth filing rather than a
reason to flatten the titles to ASCII.

## Repointing the layer

Once a serving table exists and pg_featureserv exposes it, the change in
`public/mapcontrols.js` is the `url` on the `stratChartIndex` GeoJSONLayer:

```js
url: "strat/chart_localities.geojson",
// becomes
url: "https://pgfeatureserv-180294536482.us-west3.run.app/collections/<schema>.<table>/items.json?limit=200",
```

Note `limit` — pg_featureserv defaults to 10 features. Without it the layer
renders 10 of 123 pins and looks like it worked.

**Verify these field names survive, because `showStratChart()` reads them by
name and a rename shows an empty card rather than an error:**

`chart_id`, `chart_title`, `image_url`, `preview_url`, `source_authors`,
`source_year`, `source_title`, `source_publisher`, `source_url`

The static GeoJSON at `public/strat/chart_localities.geojson` can stay in the
repo as a fallback until the served layer is confirmed working in the preview
channel.

## What is not in this table

`oldest_period`, `youngest_period` and `unit_count` are deferred — they are
aggregates over the unit rows, which are archived unvalidated at
`unit-extraction/` and not published. Do not add them to the upload.

## Loaded to prod — 2026-08-06

Topic `geolmap_strat_columns_geologic_history_book`, target schema `mapping`,
PK `chart_id`. Loaded as **GeoPackage**, not CSV — the ingest app's CSV parser
does not honour quoted fields, so a title like `Albion Mountains, Idaho` split
into two fields and shifted every column right by one, putting
`stratigraphic_column` into `longitude`. Worth filing; it will affect any CSV
with a quoted comma, which is most of them.

**Verified against `mapping.geolmap_strat_columns_geologic_history_book_current`:**
123 rows, 123 distinct `chart_id`, SRID 4326, all 18 source columns present with
names unchanged. 57 titles retain their en-dash and 10 retain their comma, with
zero mojibake — so the pipeline's UTF-8 handling is sound and the CSV problem is
specifically quote-parsing.

The round trip is **lossless**: regenerating the layer GeoJSON from the serving
table gives 0 geometry and 0 property differences against the pre-pipeline file.

### Live delivery — the layer IS pointed at a live URL

The layer reads the **ugs-warehouse OGC Features service** (the same one the
warehouse viewer uses):

```
https://ugs-warehouse-features-xedvkyurga-uc.a.run.app/collections/geolmap_strat_columns_geologic_history_book/items?limit=200
```

`limit=200` is required — the service defaults to 10 features and ArcGIS does not
follow the OGC `next` page link, so a lower limit silently renders a subset.

The layer **fetches and rebuilds Point geometry** in `addStratChartIndex()`
rather than pointing a `GeoJSONLayer` straight at that URL, because the serving
table is **MultiPoint** and ArcGIS SceneView (3D) will not create a layer view
for MultiPoint (2D MapView accepts it). This was proven format-independent
(GeoJSONLayer, OGCFeatureLayer, and a plain FeatureLayer all fail 3D with
MultiPoint, all succeed with Point) and traced to a deliberate, sound pipeline
convention (`geoparquet-conversion` promotes all geometry to multi; harmless to
MapLibre, required for typed PostGIS columns). The `longitude`/`latitude`
properties travel in the endpoint response, so the rebuild is lossless. The
committed `strat/chart_localities.geojson` (already Point) is the offline
fallback. See the comment on `addStratChartIndex` and the ALL-5470 notes.

> **Earlier note corrected:** an earlier version of this file said pg_featureserv
> "does not expose mapping.* serving tables" and that live delivery needed infra
> work. That was wrong — it read a stale collection cache. pg_featureserv exposes
> 36 `_current` collections; ours appears there on catalog refresh. And the
> warehouse features service above serves it live regardless. The only real
> constraint was the MultiPoint/3D geometry issue above, not delivery.

### dbt added six columns

`_publication_date`, `metadata_publication_id`, `quad_name`, `review_status`,
`scale`, `table_type`. Nothing reads them. `review_status` is the one to watch —
if anything downstream ever filters on it, these 123 rows need the right value or
they will silently vanish.
