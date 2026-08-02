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
redistribute); see `strat_charts/orient.py` for the expected paths.

Content use permitted by the BYU Department of Geological Sciences.

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

### Global straight-edge fitting (`edges.py`, kept but unused)

`edges.py` fits each edge as a straight line over 84% of its length and
intersects adjacent pairs. It legitimately **raises** on the real raster
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

`edges.py` is kept because `perimeter.py` imports its `EDGES` and `CORNER_EDGES`
topology.

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
