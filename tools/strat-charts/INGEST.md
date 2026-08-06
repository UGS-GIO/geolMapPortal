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
