# Transcription conventions — stratigraphic charts (ALL-5470)

Every disagreement in the 5-chart pilot came from readers inventing their own
convention, not from misreading. Follow these exactly; they are the difference
between 94% and ~100% agreement.

## Row anchoring
Transcribe **row by row, keyed to the printed red index**. Never renumber.
Never infer a row's contents from its neighbours.

## The red rules are a hint, not the truth
They are auto-detected and are wrong in both directions:
- **Under-detect**: two consecutive units that both lack a thickness share one
  row index (no rule between them). Emit **one object per unit**, same `row`.
- **Over-detect**: spurious rules appear inside tall cells, so some indices
  label no unit at all. Emit nothing for them; `row` values may skip.

Where a rule cuts through a unit's text, **trust what is printed**. Record the
unit once, against the row its name sits in.

## `period` — transcribe the glyph, do not expand it
| printed | record as |
|---|---|
| barred-O (phi-like) | `Φ` |
| barred-P (Pennsylvanian) | `IP` |
| Triassic ligature | `TR` |
| Precambrian barred-C | `pЄ` |
| PP with footnote star | `PP*` |

Otherwise transcribe verbatim as printed (`CAMB`, `MISS`, `PENN`,
`NEOPROTEROZOIC`, `JURASSIC`). Do **not** normalise `PENN` to `P` or expand
`Φ` to `O-M-P` — the reader's job is what is on the page.

When a period cell boundary falls *inside* a row, record the period whose fill
covers the majority of that row, and flag it.

## `notes`
- Join distinct entries with `; ` (semicolon-space). Never a comma.
- Reflow a wrapped sentence into one line with plain spaces.
- A **boxed note spanning several rows** attaches to the row where its text
  **begins**, with `"note_spans": true`. Do NOT split it across rows.
- A note bisected by a rule goes to the row containing most of its ink.
- Keep italicised fossil names; do not mark up the italics.

## `column_variant` — lateral facies
Some charts (e.g. 069 Uinta Basin) carry two named columns for the same
interval: West/East, South/North. Emit **one object per printed name**, all
sharing the same `row`, each with `"column_variant": "West"` etc. Duplicate the
shared thickness onto both. Omit the key entirely on single-column charts.

## `is_banner`
Some rows are full-width text banners, not units (unconformity announcements,
sequence headings). Record the text as `unit_name` with
`"is_banner": true` and empty thickness.

## Never invent
If a value cannot be read, put `"UNREADABLE"` in that field and list it in your
report. An honest gap is recoverable; a plausible invention is not.

## Object shape
```json
{"seq":1,"row":1,"period":"Q","parent_unit":"Twin Creek Ls","unit_name":"...",
 "thickness_text":"0-200","notes":"...","column_variant":"West",
 "is_banner":false,"note_spans":false}
```
`parent_unit`, `column_variant`, `is_banner`, `note_spans` are optional — omit
when they do not apply. `seq` counts units 1..n over the whole chart; `row` is
the printed index; they differ whenever a row holds multiple units.
