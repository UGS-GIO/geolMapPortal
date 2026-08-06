# Known issues

Ordered by what would bite first if this data were used as-is.

## Blocking use in a product

1. **No measured error rate on 4,244 of 4,343 rows.** Single-pass. The fix is a
   second independent read plus `tools/diffpass.py`. Everything else on this
   list is smaller than this one.

2. **`notes` is the weakest column** — 67–82% inter-pass agreement in the pilot,
   mostly disagreement about which row a straddling boxed note belongs to. Treat
   as indicative, not authoritative.

## Needs a source re-read

3. **Two period-order violations**, flagged by the time-scale check:
   - chart 36, `unit_seq` 21 — `IP` → `PERMIAN`, unit `upper unit`
   - chart 54, `unit_seq` 9 — `PP` → `MISS`, unit `Upper limestone mbr`

   Either the period was misread or the chart genuinely prints them out of
   order. Not corrected without looking.

4. **`Toano Limestone` (×1) vs `Joana Limestone` (×10).** Both are real
   formations, so the lexicon check cannot resolve it — but a `J`/`T` misread is
   plausible. Re-read the source cell.

5. **One `UNREADABLE` field** — chart 117, second unit of row 9. The reader
   judged it "almost certainly `lower member`" from context and correctly
   declined to write a guess.

## Understood and deliberate — do not "fix"

6. **Book typos are preserved verbatim**: `PENNSYLVNIAN`, `Molas Foramtion`,
   `Petrifed Forest`, `Monument Upward`, `brachipods`, `mustone`, `Chilne`.

7. **`unit_name` is inconsistent because the book is.** `M`, `Mbr` and `Member`
   all appear. This was once mistaken for a transcription defect; see
   PROVENANCE.md. Use `unit_name_normalized` for anything that needs consistency.

8. **`lithology_pattern` is empty.** The lithology swatch column was never
   transcribed — it is graphical, not textual, and would need a pattern
   classifier rather than a reader.

## Structural caveats worth knowing

9. **`row_index` is not a key.** Several units share one; some indices label
   nothing. Chart 102 has 41 units across 4 detected rows.

10. **Ambiguous `M`** — five names (`Needle Siltstone M`, `Brushy Basin M`,
    `Petrified Forest M`, `Sneakover Ls M`, `Fossil Mountain M`) could expand to
    either `Mbr` or `Member`. Immaterial to `unit_name_normalized`, which
    resolves both to `Member`.
