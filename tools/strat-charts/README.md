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

## Finding boundary corners

`strat_charts/edges.py` fits each of Utah's six boundary edges along its length
(skipping `END_MARGIN_FRAC` = 8% at each end, so 84% of it) and intersects
adjacent pairs to get the corners. `data/corner_seeds.json`
only says roughly where each edge runs; the seeds are never refined and must not
influence the result. `fit_all_edges` raises rather than returning a low-quality
fit — see `MAX_RMS_PX`.

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

### Known ceiling: the photographed page is not planar

Edge fitting is a large improvement, but on the current raster
`fit_all_edges` legitimately **raises** on the `north` edge (RMS 8.00 px vs a
3.0 px limit). Investigation showed this is a property of the input, not of the
fit:

* **Illumination gradient.** Local background runs ~220 at the top of the page
  to ~165 at the bottom. The south rule's ink is ~155 against a background of
  ~170, so a single global `DARK_THRESHOLD = 140` cannot see it, while dark
  text at 80–100 is highly visible. Only 45% of scans along the south edge
  found any ink under the global threshold, and those were preferentially the
  ones contaminated by labels — a selection effect that biases the fit rather
  than merely adding noise.
* **Page curvature.** Tracked with an adaptive threshold and a thin-run filter,
  the two long edges crossing the curved part of the page are genuinely bowed:
  `south` has a sagitta of −15.4 px and `nevada` −11.7 px, and a quadratic
  drops their residual from 4.49/3.59 px to 1.00/0.68 px. The other four edges
  are straight to within ~0.3–2.3 px. `orient.py` applies EXIF orientation
  only; nothing dewarps the page.

Fitting straight lines anyway displaces the corners by up to **21.8 px
(~4.3 km)** at `sw` and ~14 px at `se` and `nw`, relative to the local tangent
at each corner. `MAX_RMS_PX` refusing the fit is that systematic error being
caught rather than shipped. Removing the ceiling requires dewarping the page,
using a non-rigid georeference with many control points, or re-imaging the page
flat — not a looser threshold.
