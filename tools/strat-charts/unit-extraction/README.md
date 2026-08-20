# Stratigraphic unit extraction — NOT VALIDATED, NOT FOR PUBLICATION

> ## ⚠ Status: single-pass transcription. Do not publish, serve, or cite this data.
>
> 4,343 unit rows were transcribed **once each**. They have passed *structural*
> checks only — checks that catch impossible values, not wrong ones. A
> confidently misread thickness passes every check in this folder.
>
> **What has actually been measured:** 99 unit rows, on two charts, read
> independently 2–3 times. See [`pilot/AGREEMENT.md`](pilot/AGREEMENT.md).
> **The other 4,244 rows have no measured error rate at all.**
>
> Before any of this is used in a product, run the second independent pass
> (`tools/diffpass.py` exists for exactly that) and publish the resulting
> agreement rate.

Extracted from the 123 stratigraphic charts of *Geologic History of Utah: A
Field Guide to Utah's Rocks* (Hintze & Kowallis, 2nd ed., 2021), used with the
permission of the BYU Department of Geological Sciences. ALL-5470.

## What is here

| path | what it is |
|---|---|
| `strat_chart_units.csv` | the 4,343-row table — see [`SCHEMA.md`](SCHEMA.md) |
| `charts/NNN.json` | per-chart transcription, the primary record; one file per chart so any single chart can be re-done without touching the rest |
| `pilot/` | the 2–3 independent reads of charts 34 and 105 — the **only** evidence of agreement anywhere in this folder |
| `CONVENTIONS.md` | the spec every reader followed. Without it the data is not interpretable — it explains why `M`, `Mbr` and `Member` all appear |
| `source_manifest.csv` | SHA-256 of all 123 source images, so a future run can prove it used the same inputs |
| `tools/` | grid detection, segmentation, the diff harness, the QA checks |
| [`PROVENANCE.md`](PROVENANCE.md) | how this was produced, and what was and was not verified |
| [`KNOWN_ISSUES.md`](KNOWN_ISSUES.md) | the open list, including two rows that need a source re-read |

## The one thing to understand before using it

`unit_name` is **verbatim** — exactly what the chart prints. The book is
internally inconsistent: `Shinarump Cg M`, `Shinarump Cg Mbr` and
`Shinarump Conglomerate Mbr` are all the same unit, printed three ways
depending on how much room the cell had.

`unit_name_normalized` expands those abbreviations and is what any filter or
join should query. Searching `unit_name` alone for "Shinarump Conglomerate
Member" matches 1 row; searching the normalized column matches 16.

Do not "fix" `unit_name` to match the normalized form. It is the record of what
the page says, and a transcription that silently corrects its source stops
being a transcription.

## Reproducing

```
python3 tools/grid.py <chart.jpg>          # detect the table grid
python3 tools/segment.py <chart.jpg>       # cut row-indexed segments for reading
python3 tools/qa.py                        # structural checks over charts/
python3 tools/diffpass.py 034 105          # agreement between independent passes
```

Source images are not committed here — they are the book's content. Paths and
checksums are in `source_manifest.csv`.
