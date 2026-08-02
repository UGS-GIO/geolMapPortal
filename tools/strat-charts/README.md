# Stratigraphic chart index tooling

One-off provenance tooling for ALL-5470. Georeferences the index map from
*Geologic History of Utah* (Hintze & Kowallis, 2nd ed., 2021) and produces the
123 locality points published as a Geologic Map Portal layer.

This is kept in the repo so the layer's provenance is findable, not because it
runs in production. Nothing here is deployed — `firebase.json` serves `public/`
only.

## Running

    python3 -m pip install -r requirements.txt
    python3 -m pytest tests/ -v

Source photographs live outside the repo (they are large and not ours to
redistribute), and `out/` is gitignored, so a clone starts with neither. The
session fixtures in `conftest.py` are the single mechanism for that: they
rebuild `out/index_map_a.jpg`, `out/working_a.png` and the GCP-tagged raster
from `~/Documents/temp_data/IMG_4168.HEIC` when those are missing, and **skip**
the tests that need them — naming the file that could not be produced — when the
photograph is not there either. So a clone with the photograph runs the whole
suite, and a clone without it skips cleanly rather than failing. A conversion or
warp that runs and *fails* still raises: an absent input is a skip, a broken
toolchain is not.

`data/perimeter_gcps_golden.csv` is an expectation, not an input — nothing in the
pipeline reads it. It holds the 292 control points the perimeter trace emits, so
that a change to a tracing constant fails a test instead of silently moving all
123 published pins. See "Open: corner determination…" below.

Content use permitted by the BYU Department of Geological Sciences.

## Phase 0 deliverables

`strat_charts/overlay.py` writes the two artifacts a human judges:

| File | Contents |
| --- | --- |
| `out/localities.csv` | 123 rows — `chart_id`, `index_label`, `source_filename`, `longitude`, `latitude`, `position_uncertainty_m` |
| `out/qa_overlay.png` | State outline, 123 numbered pins, and the 18 check-point offsets drawn as a vector field |

`RESIDUALS.md` is the report to read before relying on either. It states the
measured accuracy, what is bounded rather than measured, and what these pins may
and may not be used for. The short version: the georeference is good to tens of
metres, the *pins* to about 18 km, and the difference is the book's own label
placement — see "Accuracy" below.

## Dense perimeter control

`strat_charts/perimeter.py` is the current approach. It traces each of Utah's six
drawn boundary rules and emits a control point every few pixels, because the
boundary is not a shape to fit but a dense, exactly-known deformation field:
every point on the south edge is at latitude 37.0 by definition, every point on
the Nevada edge at longitude −114.0506389. A thin-plate spline over those points
absorbs the projection and the page distortion together.

Geography is assigned by arc-length fraction along the traced rule. Along a
parallel in a conic projection that is exact — longitude is proportional to
angle, hence to arc length. Along a meridian, latitude spacing is very slightly
non-uniform; across Utah's 5° the departure is a few tenths of a percent, well
under the tracing precision.

`data/corner_seeds.json` says only roughly where each edge runs. The six corners
are recovered from the ink, as the intersection of the arcs fitted to the two
traces meeting there. Each edge is then **traced a second time between those
corners**, which is what actually makes the seeds inert: a trace lays its scans
along the line between its endpoints, so seed-anchored scans shift bodily with
the seeds and take the marginal detections with them. Over ten constant seed
offsets of up to ±10 px, one pass moved the control points 2.90 px and the
corners 1.88 px; two passes bring those to 0.55 px and 0.49 px, with a median
movement of 0.07 px.

Points are dropped, not invented, where the rule is interrupted. A control point
has to fall *inside* a continuously inked stretch — near the end of one is not
enough, and neither is being near ink that turns out to be lettering. **292 of a
possible 360 survive** on the real raster:

| edge | ink coverage | worst gap | control points |
|---|---|---|---|
| north (42°N) | 64% | 12% | 39 |
| wyoming (−111.0506°) | 68% | **33%** | 40 |
| forty_first (41°N) | 87% | 6% | 54 |
| colorado (−109.0506°) | 95% | 2% | 56 |
| south (37°N) | 86% | 8% | 51 |
| nevada (−114.0506°) | 88% | 4% | 52 |

Those gaps are deliberate cartography, not detection failures — the rule is
broken to clear "27 Bear Lake" and "28 Crawford" on the Wyoming meridian,
"Albion", "Strevell" and "Curlew" on the north edge, "St. George" on the south.
`build_perimeter` returns this table alongside the points, and raises naming the
edge and its coverage if any edge exceeds `MAX_SPAN_GAP`. **Do not widen the
search, lower the contrast threshold or relax the rule-width band to recover the
missing stretches.** The ink is not there; a thin-plate spline needs correct
control points, not evenly spaced ones, and the Wyoming break is braced by the
north edge, the 41st parallel and the Colorado meridian either side of it.

## Accuracy

`strat_charts/accuracy.py` measures the georeference two independent ways,
because neither alone is honest. A thin-plate spline reproduces its control
points exactly, so residuals *at* the GCPs are zero by construction and mean
nothing.

Both methods take pixels measured on the **source** raster, so both go through
`georef.source_pixel_to_lonlat` and the GCP-tagged intermediate — never
`pixel_to_lonlat`, which reads the warped output's own affine grid (3626×3653
against the source's 3024×4032). On identical input the two disagree by 27–124
km, silently. That mistake once turned a working georeference into an apparent
100 km failure, so the module and its tests assert the choice rather than
leaving it to review.

Every number in this section is regenerable from the repo. `perimeter` emits
bare `(px, py, lon, lat)` tuples and `georef.warp` needs named `Gcp` records, so
`accuracy.gcps_from_perimeter` bridges them — it also generates the names, since
`loo_residuals` builds a filename from each one and a name carrying a path
separator would write outside the work directory:

```python
gray = np.asarray(Image.open("out/working_a.png").convert("L")).astype(float)
seeds = json.load(open("data/corner_seeds.json"))["seeds"]
gcps = accuracy.gcps_from_perimeter(perimeter.build_perimeter_gcps(gray, seeds))

georef.warp("out/working_a.png", "out/index_map.tif", gcps)          # 292 GCPs
tagged = georef.gcp_tagged_path("out/index_map.tif")

rows = accuracy.check_point_offsets(tagged, accuracy.load_check_points(
    "data/check_points.csv"))
accuracy.summarise([r["error_m"] for r in rows])                     # table 2
accuracy.offset_bias(rows)                                           # table 3

accuracy.loo_residuals(gcps, "out/working_a.png", "out/loo")         # table 1
```

**`loo_residuals` is expensive and does more work than it needs.** It calls
`georef.warp`, which runs `gdal_translate` (tags the GCPs) and then
`gdalwarp -tps` (resamples the whole 3024×4032 raster). Only the tagged
intermediate is read back — the warped output is never opened. Over 292
iterations that is ~10 minutes and about **22 GB** written to the work
directory, none of it consumed. Delete the directory afterwards.

### Leave-one-out cross-validation (rigorous, boundary only)

`loo_residuals` warps with 291 of the 292 perimeter control points and predicts
the one held out. It is self-contained and needs no external data, but it only
samples the boundary — where all the control is — so it measures interpolation
between neighbouring control points, not extrapolation into the interior.

Measured on the real raster, 292 points, 634 s:

| edge | n | min | median | max | RMSE |
|---|---|---|---|---|---|
| north (42°N) | 39 | 1.21 | 13.19 | 477.0 | 96.8 |
| wyoming (−111.0506°) | 40 | 0.10 | 5.82 | 45.3 | 14.5 |
| forty_first (41°N) | 54 | 0.13 | 10.57 | 101.1 | 23.3 |
| colorado (−109.0506°) | 56 | 1.34 | 16.73 | 61.2 | 23.0 |
| south (37°N) | 51 | 0.38 | 8.04 | 546.8 | 103.8 |
| nevada (−114.0506°) | 52 | 0.26 | 7.93 | 136.9 | 35.2 |
| **all** | **292** | **0.10** | **10.03** | **546.8** | **59.9** |

Metres; p90 = 37.4, p95 = 57.1. At 198 m/px that is a median of 0.05 px and an
RMSE of 0.30 px — the spline is essentially exact where it has control.

**The tail is two corners, not a spread.** Eight of the ten worst residuals sit
within ~60 px of `nw` (≈560, 550) or `sw` (≈450, 3420) — the two corners this
README already flags as having non-boundary ink in any usable window. A
held-out corner point is also the hardest case by construction, since the
remaining control extrapolates to it rather than interpolating. Both readings
agree with the `CORNER_ARC_POINTS` caveat below.

### Gazetteer check points (independent, interior)

`data/check_points.csv` holds 18 towns whose chart number is printed on the
index map. Coordinates come from the USGS GNIS Domestic Names file for Utah
(`feature_class = "Populated Place"`, fields `prim_long_dec` / `prim_lat_dec`),
retrieved 2026-08-02 from
`https://prd-tnm.s3.amazonaws.com/StagedProducts/GeographicNames/DomesticNames/DomesticNames_UT_Text.zip`.
Note the path is `*_UT_Text.zip`; plain `*_UT.zip` returns 404. The pixel
anchors are the centroid of the black chart-number glyph, found by masking on
achromatic dark ink — the numbers are printed black and the place names red, so
colour separates them cleanly.

**The label offset is the dominant term, and it is not subtracted out.** The
index map carries no locality dot: the number glyph and the place name *are* the
only mark, and the book places them near the locality, for legibility, not on
it. Check-point error therefore measures glyph placement plus georeference error
together, and it cannot be decomposed with this map. That is genuine uncertainty
for this dataset, and a pin's usefulness depends on the total.

Great-circle residuals, from `check_point_residuals` + `summarise`:

| statistic | all 18 | excluding charts 115 and 118 |
|---|---|---|
| min | 7.90 km | 7.90 km |
| median | 13.19 km | 11.60 km |
| max | 39.15 km | 25.25 km |
| RMSE | **18.00 km** | **13.41 km** |

Taken at face value that would condemn the layer. It does not, and the reason is
in the *structure* of the residuals rather than their size.

A distance says how far a pin is out but not which way, and direction is the
whole question: a systematic warp averages to a large offset, while randomly
placed labels average to zero. `check_point_offsets` and `offset_bias` compare
each glyph pixel with the pixel the georeference predicts for the GNIS
coordinate — `source_pixel_of` is the inverse transform, so this is measured,
not asserted:

| statistic | value |
|---|---|
| mean offset | (+0.53, +2.17) px |
| standard error of the mean | ±16.95, ±16.24 px |
| t statistic | dx +0.03, dy +0.13 |
| rms offset magnitude | 96.8 px (71.0 px excluding charts 115 and 118) |
| corr(dx, px), corr(dx, py) | +0.015, −0.089 |
| corr(dy, px), corr(dy, py) | +0.292, +0.444 |

Offsets are reported in pixels and left there. Converting a pixel magnitude to
kilometres needs a single metres-per-pixel scale, and this map does not have one
— it is drawn conically, so scale varies with latitude, which is the whole
argument of the "Global straight-edge fitting" section below. For orientation
only: at the nominal ~198 m/px, ±17 px is roughly ±3.4 km, and 96.8 px is
roughly 19 km against the 18.00 km the great-circle calculation actually gives.
Use the metre figures above for anything that matters.

A systematic warp would show up as a large mean, or as offsets correlated with
position. Neither appears: the mean is two pixels on a ninety-seven pixel
scatter (|t| ≈ 0.1, against ~2.1 for significance at n = 18), and the east–west
offsets are uncorrelated with location. The scatter is isotropic and centred on
zero, which is what randomly placed labels look like. The corollary is a limit,
not a clean bill of health: **these check points cannot resolve interior error
finer than roughly their own RMSE — 13–18 km depending on whether the two
ambiguous labels are counted** — because that is the label-placement noise
floor. Both figures are given because dropping points to get the smaller one is
the failure mode this section exists to avoid.

One thread is left loose rather than tidied away. `corr(dy, py) = +0.44` is a
weak north–south trend in the vertical offsets; it survives dropping the worst
point (+0.40), so it is not a single outlier. At n = 18 it is not significant,
and this much label noise is far too coarse to confirm or exclude a real
few-kilometre trend. Unresolved.

The two largest residuals confirm the reading. Chart 118 is printed **"Vernal
NW"** and chart 115 **"Monticello-Bluff"** — neither names the town alone — and
their offsets point exactly where the printed name says they should (118 lies
NW of Vernal; 115 lies south of Monticello, toward Bluff). They are kept in the
table rather than dropped, because selecting check points to flatter the result
is the failure mode this section exists to avoid.

### Open: corner determination, not seed placement, is the accuracy floor

`perimeter.CORNER_ARC_POINTS` is a tuned point count, not a distance. Varying it
120 → 450 moves the emitted control points by up to **8.73 px (~1.7 km)** — an
order of magnitude beyond the 0.49–0.55 px seed-jitter stability reported above,
so **corner determination, not seed placement, is the accuracy floor.**

The leave-one-out tail is consistent with that: eight of the ten worst held-out
residuals sit at the `nw` and `sw` corners. That is corroboration, not proof —
it is measured *at* the corners, not in the interior they anchor.

The check points cannot presently arbitrate it either. 1.7 km sits far under
their 13–18 km label-offset floor, so the measurement that would settle it does
not exist yet. Anything needing interior accuracy better than a few kilometres
needs a better check set: **drawn features rather than labels** — the Great Salt
Lake shoreline, the Green–Colorado confluence, the interstate route lines. Those
are drawn at their mapped position instead of placed for legibility, so they
carry no label offset and would drop the noise floor by roughly an order of
magnitude.

**Untuned is not the same as unguarded.** The whole suite once passed at every
setting from 120 to 450, so an accidental edit to that constant — or to
`TRACE_SCHEDULE`, or to `SMOOTH_HALF_WIDTH` — would have shipped green while
moving every pin more than a kilometre.
`test_gcps_match_the_committed_golden_control_set` compares the emitted set
against `data/perimeter_gcps_golden.csv` and fails on a changed count, a dropped
or added point, or any matched point moving more than 0.25 px. Measured: the
250 → 180 substitution changes the count 292 → 295, 250 → 350 changes it to 293,
and a `SMOOTH_HALF_WIDTH` change that leaves the count alone still moves a point
1.18 px. Regenerating the golden file is a deliberate act — never a way to make
this test pass.

## Superseded

### Local corner refinement (`corners.refine_corner`, removed)

The first approach fitted two short limbs inside a 15–60 px window centred on
each corner. That window is exactly where the drawing is most cluttered: chart
numbers, place labels, and the page gutter all crowd the corners. Measured on
the real raster at ~198 m/px under ±8 px seed jitter, across 486 runs:

| corner | median | worst | worst in metres |
|---|---|---|---|
| n_notch, ne, se | 0.5–0.7 px | ≤13 px | ~2.5 km |
| nw | 0.55 px | 71 px | ~14 km |
| sw | 3.96 px | 32 px | ~6 km |
| notch_inner | 6.96 px | **1119 px** | **~222 km** |

Nothing ever raised — every failure was silent, and the `det < 1e-6`
parallelism guard could not help because `|det|` was 0.90–0.96 at the worst
corners. `notch_inner` never converged at any window size tested. The code is
gone; the lesson is that a fit wants leverage, and a short limb in the noisiest
part of the image has none.

### Global straight-edge fitting (`edges.py`, removed)

`edges.py` fitted each edge as a straight line over 84% of its length and
intersected adjacent pairs. It legitimately **raised** on the real raster
(`north`, RMS 8.00 px against a 3.0 px limit). The first diagnosis was page curl,
and it was wrong. Measured E–W width between the Nevada and Colorado meridians,
by image row:

| row | ≈ latitude | width (px) |
|---|---|---|
| 1300 | 40.6°N | 2228.7 |
| 2050 | 39.2°N | 2265.0 |
| 3050 | 37.8°N | 2313.7 |

Top/bottom ratio **0.9632**; cos-latitude predicts **0.9604**; plate carrée
predicts 1.0000. The widths are good to ~1 px in 2200, so the 0.3% agreement with
cos-latitude settles it: **the map is drawn in a conic-style projection.**
Meridians converge and parallels are arcs, so "a boundary edge is a straight
line" was false *at the source*, not merely false about the photograph.
Re-photographing the page flat would remove only a secondary term, and no number
of corner GCPs can express a projection. That is why the two attempts above could
not have paid off, and it is why the fix was to stop fitting the boundary and
start tracing it. Do not reintroduce straight-line fitting.

**The module is gone; the finding above is the part worth keeping.** `edges.py`
was retained for a while because `perimeter.py` imported its `EDGES` and
`CORNER_EDGES` topology, but those two dicts were the only live lines in it —
`sample_edge`, `fit_edge`, `fit_all_edges`, `corners_from_edges` and `intersect`
had no caller once tracing replaced fitting. Keeping them meant a test file
(`tests/test_edges.py`) that exercised nothing the pipeline runs, which reports
coverage over dead code and is worse than no coverage at all: the defects it
would have found — `MIN_INLIERS` as an absolute count, an inlier-only `rms`, an
ineffective `1e-9` determinant guard — were defects in code nothing called. The
two dicts now live at the top of `perimeter.py`, where the tracing that uses them
lives.

### Corrected: the illumination and curvature figures above

The straight-fit failure was originally attributed to two input properties. Both
descriptions were re-measured while building `perimeter.py`, and both need
qualifying.

* **The illumination gradient is real; the "faint south rule" is not.** The page
  does shade from ~220 grey at the top to ~165 at the bottom, so a single global
  threshold is genuinely unusable and `perimeter.py` thresholds a fixed contrast
  below a *local* background. But the rules are not faint anywhere: measured
  along all six traces, ink sits 73–111 grey levels below its local background
  at the median, and 66–93 at the 5th percentile on the four uncontaminated
  edges. The earlier "~155 ink against ~170 background" figure does not describe
  the rule. What actually hid the south rule in one place was the *opposite*
  problem — a threshold scaled to the darkest pixel in the scan. Where the Glen
  Canyon lettering put a 71 in the window, the threshold fell to 130 and missed
  the rule at ~135.
* **The bowing figures were measured on contaminated traces.** `south` sagitta
  −15.4 px and `nevada` −11.7 px came from a tracer that was partly following
  label text rather than the rule. Traced cleanly, departure from a fitted
  quadratic is 0.49–2.09 px rms and 3.9–6.9 px at worst across all six edges,
  against scan-to-scan noise of 0.31–0.80 px. So there *is* real shape beyond a
  quadratic, but it is a few pixels, not tens.

### Corrected: "a control point near ink is a control point on ink"

The first form of the gap test asked whether accepted ink lay within a tolerance
of each sample. It let two things through, and both are worth remembering because
both looked fine in the output.

* **The tolerance was an arc fraction.** The same nominal 1% meant 6 px on the
  611 px Wyoming edge but 29 px on the 2866 px Nevada edge — over half a control
  point spacing, on the edges where it mattered most. It is pixels now.
* **A letter stroke is rule-shaped in cross-section.** Inside the 199 px Wyoming
  break the trace accepted four fragments of 0.7, 3.9, 12.5 and 13.8 px where
  "Crawford" and "28" cross x=1815, and those alone re-admitted eleven control
  points to a stretch of map carrying no boundary at all. An observation now
  counts only if it belongs to a continuously inked stretch ≥25 px long. The two
  populations do not overlap on this raster: the longest fragment anywhere is
  20.5 px and the shortest genuine rule stretch is 34.8 px.

The symptom that led here was a seed-jitter measurement of 40–50 px. That figure
was itself an artefact — the two runs were compared by list position while
emitting different numbers of points, so it was mostly measuring an off-by-one
against the 10.2 px control point spacing on the Wyoming edge. Compared on the
graticule coordinate each point carries, the same runs agreed to 1.5 px. The bug
underneath was real; the number that found it was not. `_max_shift` in the tests
matches on geography for exactly this reason.

Fitting straight lines anyway still displaces the corners by up to **21.8 px
(~4.3 km)** at `sw`. That error is not removed by dewarping or re-imaging — it is
mostly the conic projection, which is in the drawing itself. It is removed by
using many control points and a non-rigid georeference, which is what
`perimeter.py` does. `orient.py` still applies EXIF orientation only; nothing
dewarps the page, and nothing needs to.
