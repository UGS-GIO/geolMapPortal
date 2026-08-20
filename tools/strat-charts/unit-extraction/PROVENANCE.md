# Provenance — how this data was produced

**Extracted:** 2026-08-03 / 2026-08-04
**Ticket:** ALL-5470
**Rights:** content used with the permission of the BYU Department of Geological
Sciences, confirmed by Marshall Robinson 2026-08-01.

## Source

*Geologic History of Utah: A Field Guide to Utah's Rocks*, Hintze, L.F. and
Kowallis, B.J., 2nd edition (substantially revised), 2021; 266 p. Published by
the Department of Geological Sciences, Brigham Young University, Provo, Utah.
The series/publication number is **not** established — it is absent from the
bookstore listing and from every reachable catalogue; the 2009 first edition is
BYU Geology Studies Special Publication 9.

123 chart images, SHA-256 in `source_manifest.csv`. **Chart 70 is a maps &
cross-section plate, not a stratigraphic column** — it has no unit rows, hence
122 charts here rather than 123.

## Method

1. **Grid detection** (`tools/grid.py`) — the printed table rules are found from
   pixel darkness. Column rules come from vertical dark runs; row rules from the
   thickness column, the only column that is reliably one plain cell per row.
2. **Row-indexed segmentation** (`tools/segment.py`) — each chart is cut into
   three segments with its **row number printed in a left gutter** and a rule
   drawn at every detected boundary.

   This is the design decision that matters. A transcription keyed to a printed
   row *number* cannot drift: the reader states "row 17 contains X" rather than
   "the 17th thing I saw". Column and row misalignment — the failure that
   silently corrupts this kind of extraction — becomes structurally impossible
   rather than merely unlikely.
3. **Transcription** — segments read against `CONVENTIONS.md`. Readers were
   instructed to write `UNREADABLE` rather than guess, and told explicitly that
   the printed chart outranks the detected rule wherever the two disagree.
4. **Assembly** — per-chart JSON merged to `strat_chart_units.csv`, with
   `unit_name_normalized` derived by expanding the book's own abbreviations.

**The grid is a check, not the truth.** It is wrong in both directions and this
was measured, not assumed:
- *under*-detects where consecutive units both lack a thickness (no rule between
  them). Chart 34 has 45 units in 43 detected rows.
- *over*-detects spurious rules inside tall cells. Chart 69 has 11 row indices
  that label nothing.
- fails almost entirely on chart 102 — **4 rules for 41 units**. All 41 were
  captured anyway, because the reader trusted the print.

## What was measured

Charts 34 and 105 were transcribed **independently 3× and 2×** by readers who
could not see each other's output, then diffed field by field.

| field | chart 34 (3 passes) | chart 105 (2 passes) |
|---|---|---|
| `unit_name` | **100%** (45/45) | **100%** (54/54) |
| `thickness_text` | **100%** (45/45) | **100%** (54/54) |
| `parent_unit` | 100% | 98.1% |
| `row` | 97.8% | 100% |
| `period` | 84.4% | 96.3% |
| `notes` | 82.2% | 66.7% |

**Zero substantive disagreements in 99 units.** Every difference was
representation — glyph spelling (`Φ-M-P` vs `O-M-P`), separator style, or which
row a straddling boxed note belongs to. Those findings produced
`CONVENTIONS.md`, which the full run then followed.

`notes` is the least reliable column and should carry the least trust.

## What was NOT measured

**The remaining 4,244 rows were read once.** They have no agreement rate. The
QA that ran over them is structural:

| check | result over 4,343 rows |
|---|---|
| thickness min ≤ max | 0 violations |
| thickness magnitude (>60,000 ft) | 0 violations |
| period order against the geologic time scale | 2 flags (charts 36, 54) |
| cross-chart name lexicon | no substantiated errors |

None of these can catch a plausible misreading. A thickness of `1300` misread as
`1800` passes every one.

## Two corrections to earlier claims, recorded so they are not repeated

**A reported "1.34% unit-name error rate" was wrong and is retracted.** A lexicon
check flagged 45 names as truncated (`Delle Phosphatic M` for
`Delle Phosphatic Mbr`). Cropping the source cells showed the book prints them
that way. The readers were correct on all 45; a correction manifest had been
built that would have overwritten 34 rows with text the page does not contain.
It was not applied. This is why `unit_name` is verbatim and normalization lives
in a separate column.

**Five units were genuinely lost and recovered.** `segment.py` ended the last
segment at the last *detected* rule, so on charts 20, 93 and 121 real units
below that point were never shown to any reader — `Humbug Formation`,
`Bullion Canyon Volcanics`, `Mount Dutton Formation`, `Delano Pk Tuff Mbr`,
`Weber Sandstone`. Found by testing for *coloured* (table) pixels below the last
rule, which separates table cells from the black-on-white citation footer.
`segment.py` now extends to the bottom of the coloured region; those three
charts were re-read in full.

## Known deviations from the source

The book contains typographic errors. They are transcribed **verbatim** and must
not be silently corrected: `PENNSYLVNIAN`, `Molas Foramtion`, `Petrifed Forest`,
`Monument Upward`, `brachipods`, `mustone`, `Chilne`.
