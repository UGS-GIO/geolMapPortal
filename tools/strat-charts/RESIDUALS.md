# Residual report — index-map georeference (ALL-5470, Phase 0)

**What this is.** The index map of *Geologic History of Utah* (Hintze & Kowallis,
2nd ed., 2021) was photographed, georeferenced to EPSG:4326, and the 123 printed
chart numbers digitized into point localities. This report states how accurate
those points are, how that was measured, and what the numbers permit and forbid
downstream. It is written so the decision can be made without re-deriving
anything.

**Deliverables** (both in `out/`, which is gitignored — regenerate with the
recipe at the end):

| File | Contents |
| --- | --- |
| `out/localities.csv` | 123 rows: `chart_id`, `index_label`, `source_filename`, `longitude`, `latitude`, `position_uncertainty_m` |
| `out/qa_overlay.png` | State outline, 123 numbered pins, and the 18 check-point offsets drawn as a vector field |

**The headline, in one line:** the georeference is sound to tens of metres, and
the *pins* are good to about **18 km RMSE** — because the book prints each chart
number where it fits legibly inside that chart's region, not on a locality dot.
Those are two different quantities and the second is the one to publish.

---

## 1. Leave-one-out cross-validation — the georeference itself

292 control points traced from Utah's six drawn boundary rules. Each is held out
in turn, the remaining 291 are used to build a thin-plate spline, and the
held-out point's source pixel is pushed through it and compared with its known
graticule coordinate. Runtime 634 s.

| edge | n | min | median | max | RMSE |
| --- | --- | --- | --- | --- | --- |
| north (42°N) | 39 | 1.21 | 13.19 | 477.0 | 96.8 |
| wyoming (−111.0506°) | 40 | 0.10 | 5.82 | 45.3 | 14.5 |
| forty_first (41°N) | 54 | 0.13 | 10.57 | 101.1 | 23.3 |
| colorado (−109.0506°) | 56 | 1.34 | 16.73 | 61.2 | 23.0 |
| south (37°N) | 51 | 0.38 | 8.04 | 546.8 | 103.8 |
| nevada (−114.0506°) | 52 | 0.26 | 7.93 | 136.9 | 35.2 |
| **all** | **292** | **0.10** | **10.03** | **546.8** | **59.9** |

Metres. p90 = 37.4, p95 = 57.1, p99 = 340.7. Against a nominal ~198 m/px that
median is 0.05 px and the RMSE 0.30 px. Per-point residuals for all 292 are in
`.superpowers/sdd/2026-08-01-strat-chart-georeferencing/loo-residuals.md`.

**The tail is two corners, not a spread.** Eight of the ten worst residuals sit
within ~60 px of the `nw` corner (≈560, 550) or the `sw` corner (≈450, 3420) —
the two corners where non-boundary ink ("103 Beaver Dam", the book-gutter
shadow) contaminates any usable window. A held-out corner point is also the
hardest case by construction: it is the end of its edge, so the remaining
control extrapolates to it rather than interpolating.

**Scope limit, stated plainly.** Every one of these 292 points is *on the
boundary*. This measures how well the spline interpolates between neighbouring
control points. It says nothing directly about the interior — and the median
locality sits **316 px from the nearest control point**, with 63 of the 123
beyond 300 px and 49 beyond 400 px. See §4.

Ink coverage per edge, which is why 292 points survive of a possible 360:

| edge | ink coverage | worst gap | control points |
| --- | --- | --- | --- |
| north (42°N) | 64% | 12% | 39 |
| wyoming (−111.0506°) | 68% | **33%** | 40 |
| forty_first (41°N) | 87% | 6% | 54 |
| colorado (−109.0506°) | 95% | 2% | 56 |
| south (37°N) | 86% | 8% | 51 |
| nevada (−114.0506°) | 88% | 4% | 52 |

The gaps are deliberate cartography — the rule is broken to clear "27 Bear
Lake", "28 Crawford", "Albion", "Strevell", "Curlew", "St. George". Control
points are **dropped, not invented**, where the rule is interrupted.

---

## 2. Gazetteer check points — the pins as published

18 towns whose chart number is printed on the index map, against USGS GNIS
Domestic Names for Utah (`feature_class = "Populated Place"`, `prim_long_dec` /
`prim_lat_dec`), retrieved 2026-08-02. Pixel anchors are the centroid of the
black chart-number glyph on the source raster.

| statistic | all 18 | excluding charts 115 and 118 |
| --- | --- | --- |
| min | 7.90 km | 7.90 km |
| median | **13.19 km** | 11.60 km |
| max | 39.15 km | 25.25 km |
| RMSE | **18.00 km** | 13.41 km |

Both columns are given because dropping points to reach the smaller figure is
exactly the failure mode this measurement exists to prevent. **18.00 km is the
number carried in `position_uncertainty_m`.**

| town | chart | error (m) | dx, dy (source px) |
| --- | --- | --- | --- |
| Moab | 113 | 7,898 | +39.0, +16.5 |
| Fillmore | 059 | 7,961 | −40.4, +9.1 |
| Saint George | 104 | 8,177 | +35.9, +26.8 |
| Richfield | 060 | 8,646 | +4.4, −45.8 |
| Wendover | 016 | 8,755 | −5.7, −44.2 |
| Beaver | 093 | 9,693 | +50.2, −5.6 |
| Escalante | 109 | 10,324 | +23.1, +51.4 |
| Hanksville | 099 | 11,362 | −22.3, +57.0 |
| Ogden | 025 | 11,839 | +59.1, +9.4 |
| Kanab | 106 | 14,541 | +0.4, −77.8 |
| Panguitch | 107 | 14,634 | +63.7, +47.0 |
| Logan | 024 | 15,031 | +72.0, −32.0 |
| Provo | 035 | 15,140 | +62.5, −49.9 |
| Milford | 091 | 16,026 | −74.4, +35.5 |
| Green River | 079 | 16,953 | +91.0, −0.9 |
| Cedar City | 101 | 25,251 | −125.9, −46.7 |
| Monticello | 115 | 37,754 | −45.4, +203.4 |
| Vernal | 118 | 39,152 | −177.6, −114.4 |

`dx`/`dy` are the digitized glyph pixel *minus* the pixel the georeference
predicts for the gazetteer coordinate: where the cartographer put the number
relative to where the town actually maps.

---

## 3. The 13 km is label placement, not georeference error

Taken at face value a 13 km median would condemn the layer. It does not, and
the reason is in the *structure* of the residuals rather than their size.

**The index map carries no locality dot.** The chart's number *is* its mark, and
it is printed where it sits legibly inside the region that chart covers — not on
a point. So a check-point residual is glyph placement plus georeference error,
and with this map the two cannot be separated by measurement. That is not a
nuisance to subtract out; it is the uncertainty a user of these pins faces.

What the 18 points *can* do is separate **bias** from **scatter**. A systematic
warp — rotation, shift, scale error, an interior sag — averages to a large mean
offset or produces offsets correlated with position. Randomly placed labels do
neither.

| statistic | value |
| --- | --- |
| mean offset | (+0.53, +2.17) px |
| standard error of the mean | ±16.95, ±16.24 px |
| t statistic | dx +0.03, dy +0.13 (|t| ≈ 2.1 needed at n = 18) |
| rms offset magnitude | 96.8 px (71.0 px excluding charts 115 and 118) |
| corr(dx, px), corr(dx, py) | +0.015, −0.089 |
| corr(dy, px), corr(dy, py) | +0.292, **+0.444** |

The mean is two pixels on a ninety-seven pixel scatter. That is isotropic
scatter centred on zero — what randomly placed labels look like, and not what a
bad georeference looks like.

**Three independent lines of evidence point the same way:**

1. **No detectable bias.** |t| ≈ 0.03 and 0.13 against a ~2.1 threshold.
2. **No significant position dependence.** The one non-trivial correlation,
   `corr(dy, py) = +0.444`, has t = +1.98 at n = 18 — just under significance —
   and falls to +0.295 (t = +1.15) once the two known-offset glyphs below are
   removed. It is neither confirmed nor excluded; see §4.
3. **The two worst points are labelled to be worst.** Chart 118 is printed
   **"Vernal NW"** and chart 115 **"Monticello-Bluff"**. Neither names the town
   alone, and each offset points exactly where its printed name says: 118 lies
   178 px west and 114 px north of Vernal; 115 lies 203 px south of Monticello,
   toward Bluff. Both are kept in the table. Dropping them moves the RMSE only
   from 18.00 to 13.41 km — the conclusion does not turn on them, which is the
   point.

**Offsets are reported in pixels and left there.** Converting a pixel magnitude
to kilometres needs one metres-per-pixel scale, and this map does not have one:
it is drawn in a conic-style projection (measured E–W width ratio 0.9632 against
cos-latitude's 0.9604 and plate carrée's 1.0000), so scale varies with latitude.
Measured at the map centre it is ~190 m/px against the ~198 m/px nominal figure.
For orientation only, ±17 px is roughly ±3.4 km. **Use the metre figures from
§2 for anything that matters.**

---

## 4. What is *not* established — read this before relying on the pins

Four limits. None is a defect to be fixed before use; each is a bound on what
may be claimed.

**4.1 Interior support is bounded, not measured.** All 292 control points lie on
the boundary, so the interior is a minimum-bending-energy surface with nothing
holding it. Measured against the emitted control set, the distance from a
locality to its nearest control point runs 21 px (min) / 316 px (median) /
1105 px (max); **63 of the 123 are more than 300 px from any control point and
49 are more than 400 px** — roughly 60 km and 80 km at nominal scale. Those are
the pins the spline is inventing a position for. No bias is detectable and it is
bounded
at roughly **±3.4 km** (one standard error, converted at nominal scale), but
that is an *absence of signal*, not a measurement. The check points cannot
resolve interior error below their own 13–18 km label-placement floor. Nothing
here proves the centre is right; what is shown is that if it is wrong, it is
wrong by less than the check points can see.

**4.2 `perimeter.CORNER_ARC_POINTS` is the accuracy floor, and it is untuned.**
It is a tuned point count, not a distance. Varying it 120 → 450 shifts the
emitted control points by up to **8.73 px (~1.7 km)** — an order of magnitude
beyond the 0.49–0.55 px seed-jitter stability the module advertises. Corner
determination, not seed placement, sets the floor. The leave-one-out corner tail
(§1) corroborates this but is measured *at* the corners, not in the interior
they anchor. 1.7 km sits far below the 13–18 km check-point floor, so the
present measurement is blind to it and cannot arbitrate.

The constant is therefore left where it is, but it is no longer *silent*. The
whole suite once stayed green at every setting from 120 to 450, so an edit here —
or to `TRACE_SCHEDULE`, or to the smoothing window — could move all 123 published
pins by more than a kilometre with nothing to show for it.
`data/perimeter_gcps_golden.csv` now records the 292 emitted control points, and
`test_gcps_match_the_committed_golden_control_set` fails on a count change, a
dropped or added point, or any matched point moving more than 0.25 px. It does
not make the value right; it makes a change to it deliberate.

**4.3 Sixty-three charts have no independent check.** 60 of the 123 have a
gazetteer point (`data/expected_localities.csv`) and each is required to rank as
the single nearest locality to its own town. The other 63 name ranges, canyons
and basins with homonyms or with no meaningful point coordinate; they rest on
the name-by-name cross-check against `chart_names.csv` alone. **A ~30 km
displacement of one of those would not be caught by any test.** For scale: the
median distance from a chart to its nearest neighbouring chart is 29.4 km
(min 14.6, max 60.0), so a 30 km error puts a pin on top of its neighbour.

**4.4 The `corr(dy, py)` thread is left loose, not tidied away.** See §3. At
n = 18 with 14 km of label noise, a real few-kilometre north–south trend can be
neither confirmed nor excluded. Flagged rather than dismissed.

---

## 5. What the QA overlay shows

`out/qa_overlay.png` draws the statutory outline, all 123 numbered pins, and one
line per check point running from the pin to the GNIS coordinate of the town it
names. Reading it:

- **The offsets scatter in every direction and no basin drags.** That is §3's
  conclusion made visible: the vectors do not share a heading, and their lengths
  do not grow toward any edge or corner.
- **No pin is in the wrong basin, and none is grossly misplaced.** Longitudes
  span −114.094 to −108.892 and latitudes 36.909 to 42.087 — the index map's own
  extent, which reaches past the state line.
- **Eleven pins fall outside the statutory outline** (squares, not dots). Every
  one is explained, and none is a georeference failure:

  | chart | label | beyond the line | why |
  | --- | --- | --- | --- |
  | 76 | Grand Junction | 13.7 km | a Colorado town |
  | 108 | Grand Canyon | 10.1 km | Arizona |
  | 1 | Albion | 9.6 km | Idaho |
  | 22 | Preston | 9.4 km | Idaho |
  | 3 | Strevell | 5.0 km | Idaho |
  | 120 | Phil Pico Mountain | 4.1 km | on the Utah–Wyoming line |
  | 46 | Snake Range | 3.7 km | Nevada |
  | 30 | Anschutz Ranch | 1.7 km | astride the Wyoming meridian |
  | 28 | Crawford Mtns | 1.3 km | astride the Wyoming meridian |
  | 16 | Wendover | 1.0 km | astride the Nevada meridian |
  | 4 | Curlew Valley | 0.8 km | astride the 42nd parallel |

  Chart 76 is the largest and is worth knowing about: it sits east of the
  Colorado meridian, **outside the perimeter control hull**, so the spline is
  extrapolating there rather than interpolating. Its anchor is on the right
  glyph. Four of the eleven — charts 4, 16, 28 and 30 — are within 2 km of the
  line, well inside the label-offset noise, so "outside" is not a meaningful
  distinction for them.

---

## 6. Fit for purpose?

**Yes, for locating which part of Utah a chart describes. No, for anything
needing better than a few kilometres.**

Concretely:

- **Do** publish these as approximate index points with
  `position_uncertainty_m = 18000` shown to the user. A pin says "this chart is
  about here"; at 18 km on a state 550 km across, that is a useful index.
- **Do** rely on the ordering and the regional assignment. Every chart with a
  gazetteer point ranks nearest its own town, and 16 of 18 anchor-pair swaps
  were caught by mutation testing.
- **Do not** treat a pin as the chart's measured section location, a sample
  site, or anything that would be plotted against a geologic contact. It is not
  that, and the book does not contain that.
- **Do not** quote the 59.9 m leave-one-out RMSE as the pins' accuracy. It is
  the georeference residual on the boundary and is roughly **300× tighter** than
  the pins. `tests/test_overlay.py` asserts `POSITION_UNCERTAINTY_M > 10 km`
  specifically to stop that substitution.
- **Do not** use a pin to decide which of two adjacent charts covers a place.
  The median chart spacing is 29.4 km against a 13.19 km median offset; adjacent
  charts are not reliably separable by pin position alone.

**If better than a few kilometres is ever needed**, the fix is a better check
set, not a better spline: check points drawn from *features* rather than labels
— the Great Salt Lake shoreline, the Green–Colorado confluence, the interstate
route lines with their shields. Those are drawn at their mapped position rather
than placed for legibility, so they carry no label offset and would drop the
noise floor by roughly an order of magnitude — enough to tune
`CORNER_ARC_POINTS` on evidence instead of taste, and enough to resolve §4.1 and
§4.4.

---

## 7. Reproduction

From `tools/strat-charts/`, with `out/working_a.png` present (see `README.md`
for producing it from the source photograph):

```python
import json
import numpy as np
from PIL import Image
from strat_charts import accuracy, digitize, georef, overlay, perimeter

gray = np.asarray(Image.open("out/working_a.png").convert("L")).astype(float)
seeds = json.load(open("data/corner_seeds.json"))["seeds"]
res = perimeter.build_perimeter(gray, seeds)              # 292 GCPs + coverage
gcps = accuracy.gcps_from_perimeter(res.gcps)

georef.warp("out/working_a.png", "out/index_map.tif", gcps)
tagged = georef.gcp_tagged_path("out/index_map.tif")

rows = digitize.anchors_to_localities(
    digitize.load_anchors("data/anchors.json"),
    tagged,
    digitize.load_chart_names("data/chart_names.csv"),
)                                                          # 123 localities
overlay.write_localities_csv(rows, "out/localities.csv")

checks = accuracy.check_point_offsets(
    tagged, accuracy.load_check_points("data/check_points.csv"))
accuracy.summarise([c["error_m"] for c in checks])         # table 2
accuracy.offset_bias(checks)                               # table 3
overlay.render(rows, checks, "out/qa_overlay.png")

accuracy.loo_residuals(gcps, "out/working_a.png", "out/loo")   # table 1, 634 s
```

Anchors and check points are **source-raster** pixels (3024×4032) and must go
through `georef.source_pixel_to_lonlat` against the GCP-tagged intermediate —
never `georef.pixel_to_lonlat`, which reads the warped output's own affine grid
(3626×3653). On identical input the two disagree by 27–124 km, silently. That
mistake once turned a working georeference into an apparent 100 km failure.

`loo_residuals` writes ~22 GB of TIFFs it never reads back (a known
inefficiency: it calls `georef.warp`, which resamples the full raster, while
only the tagged intermediate is used). Delete `out/loo` afterwards.

## Provenance

- Boundary coordinates: Van Zandt, F.K., 1976, *Boundaries of the United States
  and the several States*: USGS Professional Paper 909, p. 5 and p. 160
  (https://doi.org/10.3133/pp909). Nominal statutory meridians and parallels,
  not surveyed monuments — the index map's outline is drawn to the idealised
  graticule.
- Check-point and expected-locality coordinates: USGS GNIS Domestic Names,
  Utah, retrieved 2026-08-02.
- Index map: Hintze, L.F., and Kowallis, B.J., *Geologic History of Utah*, 2nd
  ed., 2021. Content use permitted by the BYU Department of Geological Sciences.
