# Schema — `strat_chart_units.csv`

4,343 rows, one per stratigraphic unit. Joins to `strat_chart_localities` on
`chart_id`.

| column | type | notes |
|---|---|---|
| `chart_id` | int | 1–123, FK to the locality table. Chart 70 is absent (a plate, not a column) |
| `unit_seq` | int | 1..n **down the chart**, top (youngest) to bottom (oldest). This is the stratigraphic order and is the only reliable ordering |
| `row_index` | int | the printed row index from the detected grid. **Not unique** — several units can share one, and some indices are absent. Provenance only; do not order by it |
| `period` | text | as printed, not expanded. `Φ`, `IP`, `TR`, `pЄ`, `PP*` are chart glyphs, not typos — see CONVENTIONS.md |
| `parent_unit` | text | the spanning formation a member sits inside, e.g. `Twin Creek Ls`. Empty when the unit is not nested |
| `unit_name` | text | **verbatim.** Exactly what the chart prints, including the book's own inconsistent abbreviations |
| `unit_name_normalized` | text | abbreviations expanded (`M`/`Mbr`→`Member`, `T`→`Tuff`, `Ls`→`Limestone`, `Cg`→`Conglomerate`, `Ss`→`Sandstone`, `Sh`→`Shale`…). **Query this, not `unit_name`** |
| `column_variant` | text | for lateral-facies charts that print two named columns for one interval (`West`/`East`, `South`/`North`). Empty on single-column charts. Used on charts 69 and 94 |
| `thickness_text` | text | **verbatim**, including `0-north 4000-south`, `1000+`, `—`. Empty where the cell is blank |
| `thickness_min_ft` | int | parsed from `thickness_text`; empty where no number is present. Lossy by design |
| `thickness_max_ft` | int | as above. `thickness_text` is authoritative |
| `lithology_pattern` | text | **not populated.** The swatch column was not transcribed |
| `notes` | text | the right-hand column, entries joined with `; `. **Least reliable field** — 67–82% inter-pass agreement in the pilot |
| `is_banner` | bool | the row is a full-width text banner (an unconformity announcement, a sequence heading), not a unit. 89 rows |
| `note_spans` | bool | the note is a boxed annotation covering several rows, attached to the row where its text begins |
| `qa_flag` | text | set where a reader could not read a value. 1 row (chart 117) |

## Ordering

Use `ORDER BY chart_id, unit_seq`. `row_index` is not an ordering key.

## Counting distinct units

Group on `unit_name_normalized`. Grouping on `unit_name` will over-count: the
book prints `Sinbad Limestone Member` four different ways.
