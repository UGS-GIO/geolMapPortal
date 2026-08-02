# Stratigraphic Chart Georeferencing (Phase 0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the photographed index map from *Geologic History of Utah* into 123 georeferenced locality points with a defensible, measured accuracy statement.

**Architecture:** Normalize the page photo, locate Utah's state-boundary corners to sub-pixel precision, warp the raster to EPSG:4326 with a thin-plate spline, digitize each numbered label anchor, then measure accuracy two independent ways — leave-one-out cross-validation on the control points, and residuals against locality coordinates sourced from an authoritative gazetteer. Output is a CSV plus a QA overlay for human judgement.

**Tech Stack:** Python 3 (Pillow, NumPy, Matplotlib, pytest), GDAL 3.12 command-line (`gdal_translate`, `gdalwarp -tps`, `gdaltransform`).

**Spec:** `docs/superpowers/specs/2026-08-01-strat-chart-index-layer-design.md`
**Jira:** ALL-5470

## Global Constraints

- Python 3 with Pillow, NumPy, Matplotlib, pytest. **No `cv2`, no `shapely`, no `osgeo` Python bindings** — none are installed. GDAL is available only as a command line.
- All output geometry is **EPSG:4326**, longitude/latitude in decimal degrees.
- **No silent failures.** Every function that can fail returns a structured error or raises. No `except: pass`, no log-and-continue.
- Generated artifacts (`.tif`, `.png`, `.csv`) go in `tools/strat-charts/out/` and are **gitignored**. Only source, tests, and small reviewed inputs are committed.
- Nothing under `tools/` is deployed — `firebase.json` serves `public/` only. Verify this stays true; do not move tooling into `public/`.
- Conventional Commits, no Jira key in the branch name. Commit messages end with a bare `ALL-5470` line.
- **Never hardcode a coordinate from memory.** Every geographic constant is either derived from the source image or sourced from a cited authority, with the citation in a comment.

---

## File Structure

```
tools/strat-charts/
├── README.md                     # what this is, how to run it, why it exists
├── requirements.txt              # pillow, numpy, matplotlib, pytest
├── strat_charts/
│   ├── __init__.py
│   ├── orient.py                 # photo -> orientation-normalized working raster
│   ├── boundary.py               # Utah boundary constants, sourced + cited
│   ├── edges.py                  # SUPERSEDED by perimeter.py (kept for its tests)
│   ├── perimeter.py              # trace the boundary -> dense GCPs
│   ├── georef.py                 # GCP table, gdal_translate/gdalwarp invocation
│   ├── accuracy.py               # LOO cross-validation + check-point residuals
│   ├── digitize.py               # label anchors -> lon/lat
│   └── overlay.py                # QA figure
├── data/
│   ├── corner_seeds.json         # hand-located pixel seeds (Task 2)
│   ├── chart_names.csv           # 123 canonical names (Task 5)
│   └── check_points.csv          # gazetteer control (Task 4)
├── tests/
│   ├── test_boundary.py
│   ├── test_edges.py
│   ├── test_perimeter.py
│   ├── test_georef.py
│   ├── test_accuracy.py
│   └── test_digitize.py
└── out/                          # gitignored
```

Each module has one responsibility and a pure-function core, so the parts that involve
looking at an image are isolated from the parts that can be tested deterministically.

---

### Task 1: Scaffolding and the oriented working raster

**Files:**
- Create: `tools/strat-charts/README.md`, `requirements.txt`, `.gitignore`
- Create: `tools/strat-charts/strat_charts/__init__.py`, `strat_charts/orient.py`
- Test: `tools/strat-charts/tests/test_orient.py`

**Interfaces:**
- Consumes: nothing.
- Produces: `orient.load_oriented(path: str) -> PIL.Image.Image` — opens a HEIC-derived
  JPEG, applies EXIF orientation, returns an RGB image with north-up page content.
  `orient.write_working_raster(src: str, dst: str) -> tuple[int, int]` — writes the
  oriented image as PNG and returns `(width, height)`.

- [ ] **Step 1: Create the package skeleton**

```bash
mkdir -p tools/strat-charts/{strat_charts,tests,data,out}
cd tools/strat-charts
printf 'pillow\nnumpy\nmatplotlib\npytest\n' > requirements.txt
printf 'out/\n__pycache__/\n*.pyc\n' > .gitignore
touch strat_charts/__init__.py
```

- [ ] **Step 2: Convert both source photos to JPEG**

The sources are HEIC. `sips` is macOS-native and already proven on these files.

```bash
SRC="$HOME/Documents/temp_data"
sips -s format jpeg "$SRC/IMG_4168.HEIC" --out out/index_map_a.jpg
sips -s format jpeg "$SRC/IMG_4167.HEIC" --out out/index_map_b.jpg
```

Expected: both write successfully. Stored size is 4032 × 3024 with EXIF orientation 6, so the page content displays as 3024 × 4032 portrait — verify with `python3 -c "from PIL import Image; i=Image.open('out/index_map_a.jpg'); print(i.size, i.getexif().get(274))"`.

- [ ] **Step 3: Write the failing test**

`tests/test_orient.py`:

```python
from pathlib import Path
import pytest
from PIL import Image
from strat_charts import orient

OUT = Path(__file__).resolve().parents[1] / "out"


def test_load_oriented_returns_rgb_portrait():
    img = orient.load_oriented(str(OUT / "index_map_a.jpg"))
    assert img.mode == "RGB"
    # The photo carries EXIF orientation 6 (rotate 90 CW): stored 4032x3024,
    # displayed 3024x4032. The page content is portrait.
    assert img.height > img.width, "page content is portrait once EXIF is applied"


def test_orientation_is_actually_applied():
    """The real failure mode is forgetting exif_transpose, not the aspect itself.

    Orientation 6 swaps the axes, so the oriented size must be the stored size
    transposed. If someone drops the transpose, this fails; a bare aspect-ratio
    assertion would not.
    """
    raw = Image.open(str(OUT / "index_map_a.jpg"))
    img = orient.load_oriented(str(OUT / "index_map_a.jpg"))
    assert (img.width, img.height) == (raw.height, raw.width)


def test_write_working_raster_roundtrips_size():
    dst = OUT / "working_a.png"
    w, h = orient.write_working_raster(str(OUT / "index_map_a.jpg"), str(dst))
    assert (w, h) == Image.open(dst).size


def test_missing_source_raises():
    with pytest.raises(FileNotFoundError):
        orient.load_oriented(str(OUT / "does_not_exist.jpg"))
```

- [ ] **Step 4: Run it and confirm it fails**

Run: `cd tools/strat-charts && python3 -m pytest tests/test_orient.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'strat_charts.orient'`

- [ ] **Step 5: Implement `orient.py`**

```python
"""Normalize the index-map page photograph into a working raster."""

from pathlib import Path

from PIL import Image, ImageOps


def load_oriented(path: str) -> Image.Image:
    """Open an image, apply its EXIF orientation, return it as RGB.

    Raises FileNotFoundError if the path does not exist. Pillow would raise a
    less obvious error later, so fail here where the cause is clear.
    """
    if not Path(path).exists():
        raise FileNotFoundError(f"source image not found: {path}")
    with Image.open(path) as img:
        return ImageOps.exif_transpose(img).convert("RGB")


def write_working_raster(src: str, dst: str) -> tuple[int, int]:
    """Write the oriented image as a lossless PNG for downstream measurement.

    PNG rather than JPEG: every later step measures pixel positions of thin
    printed rules, and JPEG ringing around high-contrast edges would bias
    sub-pixel corner refinement.
    """
    img = load_oriented(src)
    Path(dst).parent.mkdir(parents=True, exist_ok=True)
    img.save(dst, format="PNG")
    return img.size
```

- [ ] **Step 6: Run the tests and confirm they pass**

Run: `python3 -m pytest tests/test_orient.py -v`
Expected: 3 passed

- [ ] **Step 7: Write the README**

`tools/strat-charts/README.md`:

```markdown
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
```

- [ ] **Step 8: Commit**

```bash
git add tools/strat-charts
git commit -m "feat(strat-charts): scaffold georeferencing tooling and oriented raster

ALL-5470"
```

---

### Task 2: Utah boundary constants and sub-pixel corner refinement

> **PARTIALLY SUPERSEDED — executed, do not re-run.** `boundary.py` and
> `data/corner_seeds.json` stand and are used unchanged. `corners.refine_corner`
> proved measurably unsound and is replaced by Task 2b; the code below is kept
> as the record of what was tried and why it failed. Do not restore it.

**Files:**
- Create: `tools/strat-charts/strat_charts/boundary.py`, `strat_charts/corners.py`
- Create: `tools/strat-charts/data/corner_seeds.json`
- Test: `tools/strat-charts/tests/test_boundary.py`, `tests/test_corners.py`

**Interfaces:**
- Consumes: `orient.load_oriented`.
- Produces:
  - `boundary.UTAH_CORNERS: list[tuple[str, float, float]]` — `(name, lon, lat)`, six entries.
  - `corners.refine_corner(gray: np.ndarray, seed: tuple[int, int], window: int = 60) -> tuple[float, float]`
    — refines a hand-placed pixel seed to the sub-pixel intersection of the two
    boundary lines meeting there.

**Why this task exists:** a thin-plate spline interpolates its control points
exactly, so residuals *at* the GCPs are zero and meaningless. Accuracy therefore
depends entirely on the GCPs being right. Hand-placed seeds carry several pixels
of hand-eye error; refining them against the drawn line removes it and makes the
result reproducible rather than dependent on who clicked.

- [ ] **Step 1: Source the boundary coordinates — do not recall them**

Utah's boundary is legally defined by meridians and parallels, but the *surveyed*
corner monuments differ from nominal by up to ~1 km. Fetch an authoritative
definition and record it with its citation. Acceptable sources: US Census TIGER
state boundary, USGS National Map, or the state's own published corner monument
coordinates.

Write the retrieved values into `boundary.py` **with the source URL and retrieval
date in a comment**. If no source can be reached, stop and ask — do not proceed
on remembered values.

- [ ] **Step 2: Write the failing boundary test**

`tests/test_boundary.py`:

```python
from strat_charts import boundary


def test_six_corners():
    assert len(boundary.UTAH_CORNERS) == 6


def test_corners_are_named_and_ordered_counterclockwise():
    names = [c[0] for c in boundary.UTAH_CORNERS]
    assert len(set(names)) == 6, "corner names must be unique"


def test_corners_bracket_utah():
    lons = [c[1] for c in boundary.UTAH_CORNERS]
    lats = [c[2] for c in boundary.UTAH_CORNERS]
    assert -114.2 < min(lons) < -113.9
    assert -109.2 < max(lons) < -108.9
    assert 36.9 < min(lats) < 37.1
    assert 41.9 < max(lats) < 42.1


def test_notch_present():
    """Utah's NE notch: two corners share the Wyoming meridian."""
    lons = sorted(c[1] for c in boundary.UTAH_CORNERS)
    wyoming = [x for x in lons if -111.2 < x < -110.9]
    assert len(wyoming) == 2, "expected two corners on the Wyoming meridian"
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `python3 -m pytest tests/test_boundary.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'strat_charts.boundary'`

- [ ] **Step 4: Implement `boundary.py`**

Fill in the values retrieved in Step 1. Structure:

```python
"""Utah state boundary corners, used as georeferencing control.

Source: <URL retrieved in Step 1>
Retrieved: <date>

Utah is a rectangle with a notch removed from its north-east: north edge at the
42nd parallel, east edge at the Colorado meridian, south edge at the 37th
parallel, west edge at the Nevada meridian, and the notch cut by the Wyoming
meridian and the 41st parallel.

Listed counter-clockwise starting from the north-west.
"""

# (name, longitude, latitude)
UTAH_CORNERS: list[tuple[str, float, float]] = [
    ("nw", ..., ...),           # ID / NV tripoint
    ("n_notch", ..., ...),      # north edge meets the Wyoming meridian
    ("notch_inner", ..., ...),  # notch inside corner
    ("ne", ..., ...),           # CO / WY tripoint
    ("se", ..., ...),           # Four Corners
    ("sw", ..., ...),           # AZ / NV tripoint
]
```

- [ ] **Step 5: Run the boundary tests and confirm they pass**

Run: `python3 -m pytest tests/test_boundary.py -v`
Expected: 4 passed

- [ ] **Step 6: Locate coarse pixel seeds by eye**

Render the working raster with a labelled coordinate grid, view it, and read off
approximate pixel positions of the six corners. Refine by cropping tighter around
each estimate until confident to ±20 px — the refinement in Step 9 absorbs the
rest.

```python
# tools/strat-charts/scripts_grid.py  (throwaway, do not commit)
from PIL import Image, ImageDraw
img = Image.open("out/working_a.png").convert("RGB")
d = ImageDraw.Draw(img)
for x in range(0, img.width, 200):
    d.line([(x, 0), (x, img.height)], fill=(255, 0, 0), width=2)
    d.text((x + 4, 4), str(x), fill=(255, 0, 0))
for y in range(0, img.height, 200):
    d.line([(0, y), (img.width, y)], fill=(0, 0, 255), width=2)
    d.text((4, y + 4), str(y), fill=(0, 0, 255))
img.save("out/grid_a.png")
```

Record results in `data/corner_seeds.json`:

```json
{
  "_source": "hand-located on out/working_a.png, refined by corners.refine_corner",
  "image": "working_a.png",
  "seeds": {
    "nw": [0, 0],
    "n_notch": [0, 0],
    "notch_inner": [0, 0],
    "ne": [0, 0],
    "se": [0, 0],
    "sw": [0, 0]
  }
}
```

- [ ] **Step 7: Write the failing refinement test**

Test against a synthetic image with a corner at a known sub-pixel location, so
correctness is checkable without depending on the photograph.

`tests/test_corners.py`:

```python
import json
from pathlib import Path

import numpy as np
import pytest
from strat_charts import corners

DATA = Path(__file__).resolve().parents[1] / "data"


def _synthetic_corner(cx: float, cy: float, size: int = 200) -> np.ndarray:
    """White field with two dark lines crossing at (cx, cy)."""
    img = np.full((size, size), 255.0)
    for y in range(size):
        for x in range(size):
            if abs(x - cx) < 1.2 and y >= cy:
                img[y, x] = 20.0
            if abs(y - cy) < 1.2 and x >= cx:
                img[y, x] = 20.0
    return img


def test_refine_recovers_synthetic_corner():
    gray = _synthetic_corner(101.4, 98.6)
    x, y = corners.refine_corner(gray, (105, 95), window=40)
    assert abs(x - 101.4) < 1.5
    assert abs(y - 98.6) < 1.5


def test_refine_rejects_blank_window():
    """A window with no dark pixels cannot yield a corner - it must raise."""
    gray = np.full((200, 200), 255.0)
    with pytest.raises(ValueError, match="no boundary pixels"):
        corners.refine_corner(gray, (100, 100), window=40)


def test_seed_file_has_all_six_corners():
    seeds = json.loads((DATA / "corner_seeds.json").read_text())["seeds"]
    assert set(seeds) == {"nw", "n_notch", "notch_inner", "ne", "se", "sw"}
    for name, (x, y) in seeds.items():
        assert x > 0 and y > 0, f"{name} seed was never filled in"
```

- [ ] **Step 8: Run it and confirm it fails**

Run: `python3 -m pytest tests/test_corners.py -v`
Expected: FAIL — no module `strat_charts.corners`

- [ ] **Step 9: Implement `corners.py`**

```python
"""Refine hand-placed corner seeds to the sub-pixel line intersection.

A thin-plate spline reproduces its control points exactly, so GCP quality sets
the ceiling on the whole georeference. Hand-placed seeds carry several pixels of
hand-eye error; fitting the two drawn boundary lines and intersecting them
removes it and makes the result reproducible.
"""

import numpy as np

DARK_THRESHOLD = 140.0


def _fit_line(xs: np.ndarray, ys: np.ndarray) -> tuple[float, float, float]:
    """Total-least-squares line as (a, b, c) with a*x + b*y = c, a^2 + b^2 = 1.

    TLS rather than ordinary least squares because these lines can be near
    vertical, where a y-on-x fit blows up.
    """
    mx, my = xs.mean(), ys.mean()
    u = np.column_stack([xs - mx, ys - my])
    _, _, vt = np.linalg.svd(u, full_matrices=False)
    a, b = vt[-1]                      # normal to the best-fit direction
    return float(a), float(b), float(a * mx + b * my)


def refine_corner(
    gray: np.ndarray, seed: tuple[int, int], window: int = 60
) -> tuple[float, float]:
    """Return the sub-pixel corner nearest ``seed``.

    Splits the dark pixels in the window into two groups by orientation, fits a
    line to each, and intersects them.

    Raises ValueError if the window holds no boundary pixels, or if the two
    fitted lines are near parallel (their intersection would be unstable).
    """
    sx, sy = seed
    h, w = gray.shape
    x0, x1 = max(0, sx - window), min(w, sx + window + 1)
    y0, y1 = max(0, sy - window), min(h, sy + window + 1)
    patch = gray[y0:y1, x0:x1]

    ys, xs = np.nonzero(patch < DARK_THRESHOLD)
    if xs.size < 20:
        raise ValueError(f"no boundary pixels near seed {seed}")

    xs = xs.astype(float) + x0
    ys = ys.astype(float) + y0

    # Separate the two limbs: relative to the seed, one limb varies mostly in x,
    # the other mostly in y.
    dx = np.abs(xs - sx)
    dy = np.abs(ys - sy)
    horiz = dx >= dy
    vert = ~horiz
    if horiz.sum() < 10 or vert.sum() < 10:
        raise ValueError(f"only one boundary limb near seed {seed}")

    a1, b1, c1 = _fit_line(xs[horiz], ys[horiz])
    a2, b2, c2 = _fit_line(xs[vert], ys[vert])

    det = a1 * b2 - a2 * b1
    if abs(det) < 1e-6:
        raise ValueError(f"boundary limbs near seed {seed} are parallel")

    x = (c1 * b2 - c2 * b1) / det
    y = (a1 * c2 - a2 * c1) / det
    return float(x), float(y)
```

- [ ] **Step 10: Run the corner tests and confirm they pass**

Run: `python3 -m pytest tests/test_corners.py -v`
Expected: 3 passed

- [ ] **Step 11: Commit**

```bash
git add tools/strat-charts
git commit -m "feat(strat-charts): add Utah boundary control and subpixel corner refinement

Boundary corners sourced from an authoritative dataset rather than
recalled. Corner seeds are refined by total-least-squares line fits and
intersection, so GCP placement does not depend on hand-eye accuracy.

ALL-5470"
```

---

### Task 2b: Replace local corner refinement with global edge fitting

**Files:**
- Create: `tools/strat-charts/strat_charts/edges.py`
- Modify: `tools/strat-charts/tests/test_boundary.py` (tighten — see Step 1)
- Test: `tools/strat-charts/tests/test_edges.py`
- **Do not delete** `corners.py`; Task 2b supersedes its use, and Step 8 retires it.

**Why this task exists.** Task 2's `refine_corner` fits two short limbs inside a
15–60 px window centred on each corner — which is exactly where the drawing is
most cluttered by chart numbers, place labels, and the page gutter. Measured
behaviour under ±8 px seed jitter, at ~198 m/px:

| corner | median | worst | worst in metres |
|---|---|---|---|
| n_notch, ne, se | 0.5–0.7 px | ≤13 px | ~2.5 km |
| nw | 0.55 px | 71 px | ~14 km |
| sw | 3.96 px | 32 px | ~6 km |
| notch_inner | 6.96 px | **1119 px** | **~222 km** |

Zero raises across 486 runs — every failure is silent. `notch_inner` never
converges, and the `det < 1e-6` parallelism guard cannot help because `|det|` is
0.90–0.96 at the worst corners.

Each of Utah's six edges, by contrast, is a long straight rule running hundreds
to thousands of pixels. Fitting those and intersecting adjacent pairs gives every
corner far more leverage, makes corner clutter a negligible minority of each
fit, and yields a per-edge RMS residual worth reporting.

**Interfaces:**
- Consumes: `data/corner_seeds.json` (unchanged — seeds now bracket edges rather
  than being refined in place), `boundary.UTAH_CORNERS`.
- Produces:
  - `edges.EdgeFit = namedtuple("EdgeFit", "name line rms n_inliers")`, `line` as
    `(a, b, c)` with `a*x + b*y = c` and `a² + b² = 1`.
  - `edges.fit_all_edges(gray: np.ndarray, seeds: dict) -> dict[str, EdgeFit]`
  - `edges.corners_from_edges(fits: dict[str, EdgeFit]) -> dict[str, tuple[float, float]]`

- [ ] **Step 1: Tighten the boundary tests first**

`test_boundary.py` currently passes whether the Washington-meridian offset is
added, sign-flipped, or omitted — an 8.7 km longitude error ships green. Replace
`test_corners_bracket_utah` with assertions that pin the derived values:

```python
def test_washington_offset_is_applied_additively():
    """The statute defines Utah's meridians west from Washington, not Greenwich.

    Omitting the offset, or subtracting instead of adding, moves the west
    boundary about 4.3 km. A range assertion admits all three; this does not.
    """
    off = boundary._WASHINGTON_MERIDIAN_OFFSET
    assert off == pytest.approx(3.0 / 60.0 + 2.3 / 3600.0, abs=1e-12)
    lookup = {name: lon for name, lon, _ in boundary.UTAH_CORNERS}
    assert lookup["nw"] == pytest.approx(-114.0 - off, abs=1e-12)
    assert lookup["ne"] == pytest.approx(-109.0 - off, abs=1e-12)
    assert lookup["n_notch"] == pytest.approx(-111.0 - off, abs=1e-12)


def test_shared_edges_have_identical_coordinates():
    """Corners on a common meridian or parallel must agree exactly.

    An edge fit intersects two lines; if the two endpoints of an edge disagree
    on that edge's own coordinate, the control is internally inconsistent.
    """
    lookup = {name: (lon, lat) for name, lon, lat in boundary.UTAH_CORNERS}
    assert lookup["nw"][0] == lookup["sw"][0]          # Nevada meridian
    assert lookup["n_notch"][0] == lookup["notch_inner"][0]  # Wyoming meridian
    assert lookup["ne"][0] == lookup["se"][0]          # Colorado meridian
    assert lookup["nw"][1] == lookup["n_notch"][1]     # 42nd parallel
    assert lookup["notch_inner"][1] == lookup["ne"][1] # 41st parallel
    assert lookup["se"][1] == lookup["sw"][1]          # 37th parallel
```

Add `import pytest` to the test file if absent. Keep the existing
`test_six_corners`, `test_corners_are_named_and_ordered_counterclockwise`, and
`test_notch_present`.

- [ ] **Step 2: Run the tightened boundary tests**

Run: `python3 -m pytest tests/test_boundary.py -v`
Expected: all pass against the current `boundary.py`. If any fail, `boundary.py`
is wrong — report it, do not loosen the new assertions.

Then confirm they can actually fail: temporarily negate
`_WASHINGTON_MERIDIAN_OFFSET`, re-run, verify `test_washington_offset_is_applied_additively`
FAILS, and restore. A test that cannot fail is not a test.

- [ ] **Step 3: Write the failing edge tests**

`tests/test_edges.py`:

```python
import numpy as np
import pytest
from strat_charts import edges


def _draw_line(img, p0, p1, width=1.5, value=20.0):
    """Rasterize a dark line segment onto a light field."""
    (x0, y0), (x1, y1) = p0, p1
    n = int(max(abs(x1 - x0), abs(y1 - y0)) * 3) + 2
    for t in np.linspace(0.0, 1.0, n):
        cx, cy = x0 + t * (x1 - x0), y0 + t * (y1 - y0)
        for dy in range(-2, 3):
            for dx in range(-2, 3):
                px, py = int(round(cx)) + dx, int(round(cy)) + dy
                if 0 <= py < img.shape[0] and 0 <= px < img.shape[1]:
                    if np.hypot(px - cx, py - cy) <= width:
                        img[py, px] = value


# A Utah-shaped polygon with a notch, at known corner positions.
TRUE_CORNERS = {
    "nw": (200.0, 150.0),
    "n_notch": (700.0, 150.0),
    "notch_inner": (700.0, 400.0),
    "ne": (1000.0, 400.0),
    "se": (1000.0, 1200.0),
    "sw": (200.0, 1200.0),
}


def _synthetic_map(clutter=False):
    img = np.full((1400, 1200), 255.0)
    c = TRUE_CORNERS
    for a, b in [("nw", "n_notch"), ("n_notch", "notch_inner"),
                 ("notch_inner", "ne"), ("ne", "se"),
                 ("se", "sw"), ("sw", "nw")]:
        _draw_line(img, c[a], c[b])
    if clutter:
        # Dark blobs crowding the corners, as labels and chart numbers do.
        for name in ("notch_inner", "nw", "sw"):
            cx, cy = c[name]
            img[int(cy) - 14 : int(cy) + 14, int(cx) - 14 : int(cx) + 14] = 30.0
    return img


def _seeds(jitter=0):
    rng = np.random.default_rng(1234)
    out = {}
    for k, (x, y) in TRUE_CORNERS.items():
        dx, dy = (rng.integers(-jitter, jitter + 1, 2) if jitter else (0, 0))
        out[k] = [int(x) + int(dx), int(y) + int(dy)]
    return out


def test_recovers_corners_on_clean_synthetic_map():
    fits = edges.fit_all_edges(_synthetic_map(), _seeds())
    got = edges.corners_from_edges(fits)
    for name, (tx, ty) in TRUE_CORNERS.items():
        assert np.hypot(got[name][0] - tx, got[name][1] - ty) < 1.0, name


def test_survives_corner_clutter_that_defeats_local_windows():
    """The exact failure mode of the superseded local refinement."""
    fits = edges.fit_all_edges(_synthetic_map(clutter=True), _seeds())
    got = edges.corners_from_edges(fits)
    for name, (tx, ty) in TRUE_CORNERS.items():
        assert np.hypot(got[name][0] - tx, got[name][1] - ty) < 2.0, name


def test_is_insensitive_to_seed_jitter():
    """Seeds only bracket an edge; they must not move the answer."""
    base = edges.corners_from_edges(edges.fit_all_edges(_synthetic_map(), _seeds()))
    jittered = edges.corners_from_edges(
        edges.fit_all_edges(_synthetic_map(), _seeds(jitter=10))
    )
    for name in TRUE_CORNERS:
        assert np.hypot(base[name][0] - jittered[name][0],
                        base[name][1] - jittered[name][1]) < 1.0, name


def test_rejects_normalized_image_loudly():
    """A 0-1 image has no pixel below the 8-bit dark threshold.

    The superseded implementation silently returned the seed for such input,
    which reads as success.
    """
    img = _synthetic_map() / 255.0
    with pytest.raises(ValueError, match="8-bit"):
        edges.fit_all_edges(img, _seeds())


def test_blank_edge_raises():
    img = np.full((1400, 1200), 255.0)
    with pytest.raises(ValueError, match="too few"):
        edges.fit_all_edges(img, _seeds())


def test_fit_reports_residual_and_inliers():
    fits = edges.fit_all_edges(_synthetic_map(), _seeds())
    assert set(fits) == {"north", "wyoming", "forty_first",
                         "colorado", "south", "nevada"}
    for name, fit in fits.items():
        assert fit.n_inliers >= edges.MIN_INLIERS, name
        assert fit.rms < edges.MAX_RMS_PX, name
```

- [ ] **Step 4: Run and confirm they fail**

Run: `python3 -m pytest tests/test_edges.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'strat_charts.edges'`

- [ ] **Step 5: Implement `edges.py`**

```python
"""Locate Utah's boundary corners by fitting its six long edges.

Fitting two short limbs in a window at each corner puts the fit exactly where
the drawing is most cluttered - chart numbers, place labels, and the page gutter
all crowd the corners. Each of Utah's edges is instead a long straight rule
running hundreds to thousands of pixels. Fitting those and intersecting adjacent
pairs gives every corner far more leverage, and a per-edge residual worth
reporting.

Seeds are used only to say roughly where an edge runs. They are not refined and
must not influence the answer.
"""

from collections import namedtuple

import numpy as np

DARK_THRESHOLD = 140.0     # 8-bit; the drawn rules sit well below this
END_MARGIN_FRAC = 0.08     # skip this much of each edge at both ends
SEARCH_HALF_WIDTH = 25     # px, perpendicular search for the rule
N_SAMPLES = 400
CLIP_SIGMA = 2.5
CLIP_ROUNDS = 3
MIN_INLIERS = 40
MAX_RMS_PX = 3.0

EdgeFit = namedtuple("EdgeFit", "name line rms n_inliers")

# edge name -> (start corner, end corner)
EDGES = {
    "north": ("nw", "n_notch"),
    "wyoming": ("n_notch", "notch_inner"),
    "forty_first": ("notch_inner", "ne"),
    "colorado": ("ne", "se"),
    "south": ("se", "sw"),
    "nevada": ("sw", "nw"),
}

# corner name -> the two edges meeting there
CORNER_EDGES = {
    "nw": ("nevada", "north"),
    "n_notch": ("north", "wyoming"),
    "notch_inner": ("wyoming", "forty_first"),
    "ne": ("forty_first", "colorado"),
    "se": ("colorado", "south"),
    "sw": ("south", "nevada"),
}


def _require_8bit(gray: np.ndarray) -> None:
    """Reject a 0-1 normalized image instead of silently finding nothing."""
    if float(np.nanmax(gray)) <= 1.0:
        raise ValueError(
            "image appears 0-1 normalized; this module expects 8-bit 0-255 values"
        )


def _fit_line(xs: np.ndarray, ys: np.ndarray) -> tuple[float, float, float]:
    """Total-least-squares line (a, b, c) with a*x + b*y = c, a^2 + b^2 = 1."""
    mx, my = xs.mean(), ys.mean()
    u = np.column_stack([xs - mx, ys - my])
    _, _, vt = np.linalg.svd(u, full_matrices=False)
    a, b = vt[-1]
    return float(a), float(b), float(a * mx + b * my)


def _residuals(line, xs, ys) -> np.ndarray:
    a, b, c = line
    return a * xs + b * ys - c


def sample_edge(
    gray: np.ndarray, p0: tuple[float, float], p1: tuple[float, float]
) -> tuple[np.ndarray, np.ndarray]:
    """Walk the seed-to-seed line and find the drawn rule at each step.

    At each sample the search runs perpendicular to the nominal direction and
    takes the darkness-weighted centroid of the dark pixels it finds, which is
    sub-pixel and tolerant of a rule a few pixels wide. Samples that find no
    dark pixel contribute nothing rather than defaulting to the nominal line.
    """
    h, w = gray.shape
    x0, y0 = p0
    x1, y1 = p1
    length = float(np.hypot(x1 - x0, y1 - y0))
    if length < 1.0:
        raise ValueError("edge endpoints coincide")

    ux, uy = (x1 - x0) / length, (y1 - y0) / length
    nx, ny = -uy, ux                      # unit normal

    ts = np.linspace(END_MARGIN_FRAC, 1.0 - END_MARGIN_FRAC, N_SAMPLES)
    offs = np.arange(-SEARCH_HALF_WIDTH, SEARCH_HALF_WIDTH + 1, dtype=float)

    xs, ys = [], []
    for t in ts:
        cx, cy = x0 + t * length * ux, y0 + t * length * uy
        px = np.rint(cx + offs * nx).astype(int)
        py = np.rint(cy + offs * ny).astype(int)
        ok = (px >= 0) & (px < w) & (py >= 0) & (py < h)
        if not ok.any():
            continue
        vals = gray[py[ok], px[ok]]
        dark = vals < DARK_THRESHOLD
        if not dark.any():
            continue
        weights = DARK_THRESHOLD - vals[dark]
        s = np.average(offs[ok][dark], weights=weights)
        xs.append(cx + s * nx)
        ys.append(cy + s * ny)

    return np.asarray(xs), np.asarray(ys)


def fit_edge(name: str, xs: np.ndarray, ys: np.ndarray) -> EdgeFit:
    """Sigma-clipped total-least-squares fit.

    Raises ValueError if too few points survive, or if the residual is too
    large to call the result a straight rule.
    """
    if xs.size < MIN_INLIERS:
        raise ValueError(f"edge {name!r}: too few boundary samples ({xs.size})")

    keep = np.ones(xs.size, dtype=bool)
    line = _fit_line(xs, ys)
    for _ in range(CLIP_ROUNDS):
        r = _residuals(line, xs, ys)
        sigma = float(r[keep].std())
        if sigma < 1e-9:
            break
        new_keep = np.abs(r) < CLIP_SIGMA * sigma
        if new_keep.sum() < MIN_INLIERS or np.array_equal(new_keep, keep):
            break
        keep = new_keep
        line = _fit_line(xs[keep], ys[keep])

    rms = float(np.sqrt((_residuals(line, xs[keep], ys[keep]) ** 2).mean()))
    n = int(keep.sum())
    if n < MIN_INLIERS:
        raise ValueError(f"edge {name!r}: too few inliers after clipping ({n})")
    if rms > MAX_RMS_PX:
        raise ValueError(f"edge {name!r}: fit residual {rms:.2f} px exceeds {MAX_RMS_PX}")
    return EdgeFit(name, line, rms, n)


def fit_all_edges(gray: np.ndarray, seeds: dict) -> dict[str, EdgeFit]:
    """Fit all six boundary edges. Raises on the first edge that cannot be fit."""
    _require_8bit(gray)
    fits = {}
    for name, (a, b) in EDGES.items():
        if a not in seeds or b not in seeds:
            raise KeyError(f"edge {name!r} needs seeds {a!r} and {b!r}")
        xs, ys = sample_edge(gray, tuple(seeds[a]), tuple(seeds[b]))
        fits[name] = fit_edge(name, xs, ys)
    return fits


def intersect(line1, line2) -> tuple[float, float]:
    """Intersection of two lines in (a, b, c) form."""
    a1, b1, c1 = line1
    a2, b2, c2 = line2
    det = a1 * b2 - a2 * b1
    if abs(det) < 1e-9:
        raise ValueError("edges are parallel; no stable intersection")
    return ((c1 * b2 - c2 * b1) / det, (a1 * c2 - a2 * c1) / det)


def corners_from_edges(fits: dict[str, EdgeFit]) -> dict[str, tuple[float, float]]:
    """Each corner is the intersection of the two edges that meet there."""
    out = {}
    for corner, (e1, e2) in CORNER_EDGES.items():
        out[corner] = intersect(fits[e1].line, fits[e2].line)
    return out
```

- [ ] **Step 6: Run the edge tests and confirm they pass**

Run: `python3 -m pytest tests/test_edges.py -v`
Expected: 6 passed

- [ ] **Step 7: Run against the real raster and report**

```bash
cd tools/strat-charts && python3 -c "
import json, numpy as np
from PIL import Image
from strat_charts import edges
gray = np.asarray(Image.open('out/working_a.png').convert('L'), dtype=float)
seeds = json.load(open('data/corner_seeds.json'))['seeds']
fits = edges.fit_all_edges(gray, seeds)
for n, f in fits.items():
    print(f'{n:12s} rms={f.rms:5.2f}px  inliers={f.n_inliers}')
for n, (x, y) in edges.corners_from_edges(fits).items():
    print(f'{n:12s} ({x:9.2f}, {y:9.2f})')
"
```

Report the per-edge RMS, the inlier counts, and the six corners. Then re-run
with every seed jittered by ±10 px and confirm each corner moves less than 1 px
— if a seed shift moves a corner, the seeds are still influencing the answer and
something is wrong.

- [ ] **Step 8: Retire `corners.py`**

`refine_corner` is superseded and measurably unsound; leaving it importable
invites someone to use it. Delete `strat_charts/corners.py` and
`tests/test_corners.py`, and note in `README.md` under a "Superseded" heading
why local corner refinement was abandoned, with the jitter figures from this
task's table. The reasoning is worth keeping even though the code is not.

- [ ] **Step 9: Commit**

```bash
git add tools/strat-charts
git commit -m "fix(strat-charts): fit boundary edges instead of refining corners locally

Local refinement fitted two short limbs in a window centred on each
corner, which is where labels, chart numbers, and the page gutter crowd
the drawing. Under 8px seed jitter one corner moved up to 1119px (~222km
at 198m/px) and nothing raised. Fitting each of the six long edges and
intersecting adjacent pairs removes the seed's influence, tolerates
corner clutter, and yields a per-edge residual worth reporting.

Also tightened the boundary tests, which previously passed whether the
Washington-meridian offset was added, negated, or omitted - an 8.7km
error that would have shipped green.

ALL-5470"
```

---

### Task 2c: Dense perimeter control

**Files:**
- Create: `tools/strat-charts/strat_charts/perimeter.py`
- Test: `tools/strat-charts/tests/test_perimeter.py`
- Modify: `tools/strat-charts/README.md` (Superseded section)

**Why this task exists — the finding that overturns Tasks 2 and 2b.**

Task 2b's edge fitting raised on the real raster (`edge 'north': rms 8.00 px`),
and straight-line residuals ran 3.2–17.2 px with sagitta up to 38 px. The first
diagnosis was page curl. **That diagnosis was wrong.** Measured E–W width between
the Nevada and Colorado meridians, by image row:

| row | ≈ latitude | width (px) |
|---|---|---|
| 1300 | 40.6°N | 2228.7 |
| 2050 | 39.2°N | 2265.0 |
| 3050 | 37.8°N | 2313.7 |

Ratio top/bottom = **0.9632**; cos-latitude prediction = **0.9604**; plate carrée
= 1.0000. Widths are good to ~1 px in 2200, so the 0.3% agreement with
cos-latitude is decisive.

**The map is drawn in a conic-style projection.** Meridians converge, parallels
are arcs. The premise that a boundary edge is a straight line was wrong *at the
source*, independent of the photograph. Re-photographing the page flat would
remove only a secondary term. Six corner GCPs cannot express a projection no
matter how precisely located, which is why the last two tasks' effort could not
have paid off.

**The reframe:** the drawn boundary is not a shape to fit — it is a dense,
exactly-known deformation field. Every point on the south edge is at latitude
37.0 by definition; every point on the Nevada edge is at longitude −114.0506389.
Trace the edges and emit a GCP every few pixels, and TPS models projection and
page distortion together, which is what TPS is for.

**Why proportional arc length is sound:** in a conic projection, longitude along
a parallel is proportional to angle, which is proportional to arc length along
that parallel's arc — so distributing longitude by arc-length fraction along a
traced parallel is *exact*, not an approximation. Along a meridian, latitude
spacing is very slightly non-uniform; over Utah's 5° span the departure is a few
tenths of a percent, well under the tracing precision.

**Interfaces:**
- Consumes: `boundary.UTAH_CORNERS`, `data/corner_seeds.json`, `edges.EDGES`.
- Produces:
  - `perimeter.trace_edge(gray, p0, p1) -> np.ndarray` shape `(n, 2)` of sub-pixel
    `(x, y)` along the drawn rule, ordered from `p0` toward `p1`.
  - `perimeter.corner_pixel(tail: np.ndarray, head: np.ndarray) -> tuple[float, float]`
  - `perimeter.build_perimeter_gcps(gray, seeds, per_edge=60) -> list[tuple[float, float, float, float]]`
    as `(px, py, lon, lat)`.

- [ ] **Step 1: Write the failing tests**

`tests/test_perimeter.py`:

```python
import numpy as np
import pytest
from strat_charts import perimeter


def _conic_map():
    """A synthetic Utah in a cos-latitude projection, drawn onto a raster.

    Meridians converge and parallels are arcs, reproducing the real figure's
    geometry - so a test that passes here is not passing by accident on a
    rectangle.
    """
    img = np.full((1500, 1300), 255.0)
    lat0 = 39.5

    def project(lon, lat):
        x = 650.0 + (lon + 111.55) * 220.0 * np.cos(np.radians(lat))
        y = 1300.0 - (lat - 37.0) * 240.0
        return x, y

    def draw(p, q, n=1400):
        for t in np.linspace(0.0, 1.0, n):
            lon = p[0] + t * (q[0] - p[0])
            lat = p[1] + t * (q[1] - p[1])
            x, y = project(lon, lat)
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    xi, yi = int(round(x)) + dx, int(round(y)) + dy
                    if 0 <= yi < img.shape[0] and 0 <= xi < img.shape[1]:
                        img[yi, xi] = 20.0

    c = {"nw": (-114.05, 42.0), "n_notch": (-111.05, 42.0),
         "notch_inner": (-111.05, 41.0), "ne": (-109.05, 41.0),
         "se": (-109.05, 37.0), "sw": (-114.05, 37.0)}
    for a, b in [("nw", "n_notch"), ("n_notch", "notch_inner"),
                 ("notch_inner", "ne"), ("ne", "se"), ("se", "sw"), ("sw", "nw")]:
        draw(c[a], c[b])
    seeds = {k: [int(round(project(*v)[0])), int(round(project(*v)[1]))]
             for k, v in c.items()}
    return img, seeds, project, c


def test_trace_follows_a_curved_parallel():
    """A traced arc must sit on the ink, not on the chord between its ends."""
    img, seeds, project, c = _conic_map()
    P = perimeter.trace_edge(img, tuple(seeds["se"]), tuple(seeds["sw"]))
    assert len(P) > 200
    x0, y0 = P[0]
    x1, y1 = P[-1]
    dx, dy = x1 - x0, y1 - y0
    L = np.hypot(dx, dy)
    nx, ny = -dy / L, dx / L
    dev = (P[:, 0] - x0) * nx + (P[:, 1] - y0) * ny
    assert np.abs(dev).max() > 3.0, "synthetic parallel should be visibly curved"


def test_traced_points_lie_on_the_ink():
    img, seeds, project, c = _conic_map()
    P = perimeter.trace_edge(img, tuple(seeds["se"]), tuple(seeds["sw"]))
    vals = img[np.rint(P[:, 1]).astype(int), np.rint(P[:, 0]).astype(int)]
    assert np.percentile(vals, 90) < 120.0


def test_corner_pixel_recovers_a_known_corner():
    img, seeds, project, c = _conic_map()
    a = perimeter.trace_edge(img, tuple(seeds["ne"]), tuple(seeds["se"]))
    b = perimeter.trace_edge(img, tuple(seeds["se"]), tuple(seeds["sw"]))
    got = perimeter.corner_pixel(a[-60:], b[:60])
    want = project(*c["se"])
    assert np.hypot(got[0] - want[0], got[1] - want[1]) < 2.0


def test_gcps_land_on_their_true_graticule_line():
    """Every south-edge GCP must carry latitude 37.0 exactly, and so on."""
    img, seeds, project, c = _conic_map()
    gcps = perimeter.build_perimeter_gcps(img, seeds, per_edge=40)
    lats = [g[3] for g in gcps]
    lons = [g[2] for g in gcps]
    assert sum(1 for v in lats if v == pytest.approx(37.0)) >= 40
    assert sum(1 for v in lons if v == pytest.approx(-109.0506389, abs=1e-6)) >= 40


def test_gcp_count_and_no_duplicate_pixels():
    img, seeds, project, c = _conic_map()
    gcps = perimeter.build_perimeter_gcps(img, seeds, per_edge=40)
    assert len(gcps) >= 6 * 40
    seen = {(round(g[0], 3), round(g[1], 3)) for g in gcps}
    assert len(seen) == len(gcps), "duplicate GCP pixels would make the TPS singular"


def test_rejects_normalized_image_loudly():
    img, seeds, _, _ = _conic_map()
    with pytest.raises(ValueError, match="8-bit"):
        perimeter.build_perimeter_gcps(img / 255.0, seeds)


def test_blank_image_raises():
    _, seeds, _, _ = _conic_map()
    with pytest.raises(ValueError, match="too few"):
        perimeter.build_perimeter_gcps(np.full((1500, 1300), 255.0), seeds)


def test_seed_jitter_does_not_move_the_gcps():
    img, seeds, _, _ = _conic_map()
    base = perimeter.build_perimeter_gcps(img, seeds, per_edge=40)
    jittered_seeds = {k: [v[0] + 9, v[1] - 7] for k, v in seeds.items()}
    jit = perimeter.build_perimeter_gcps(img, jittered_seeds, per_edge=40)
    assert len(base) == len(jit)
    d = max(np.hypot(a[0] - b[0], a[1] - b[1]) for a, b in zip(base, jit))
    assert d < 2.0, f"seeds must only bracket an edge, not steer it (max {d:.2f}px)"
```

- [ ] **Step 2: Run and confirm they fail**

Run: `python3 -m pytest tests/test_perimeter.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'strat_charts.perimeter'`

- [ ] **Step 3: Implement `perimeter.py`**

```python
"""Turn the drawn state boundary into dense georeferencing control.

The index map is drawn in a conic-style projection: meridians converge and
parallels are arcs (measured E-W width between the Nevada and Colorado meridians
grows 2228.7 -> 2313.7 px from 40.6N to 37.8N, a ratio of 0.9632 against a
cos-latitude prediction of 0.9604). Fitting straight lines to the boundary is
therefore wrong at the source, not merely wrong about the photograph.

The boundary is instead a dense, exactly-known deformation field: every point on
the south edge is at latitude 37.0 by definition, every point on the Nevada edge
at longitude -114.0506389, and so on. Tracing the rules and emitting a GCP every
few pixels lets a thin-plate spline absorb projection and page distortion
together.

Longitude is distributed along a traced parallel by arc-length fraction. In a
conic projection longitude along a parallel is proportional to angle and hence to
arc length, so that is exact. Latitude along a meridian is very slightly
non-uniform; across Utah's 5 degrees the departure is a few tenths of a percent,
well below tracing precision.
"""

import numpy as np

from .boundary import UTAH_CORNERS
from .edges import EDGES

SEARCH_HALF_WIDTH = 30      # px, perpendicular search for the drawn rule
N_TRACE = 900               # samples along each edge
TRACE_MARGIN = 0.04         # skip this fraction at each end while tracing
MAX_INK_RUN = 18            # px; a wider dark run is a label, not a rule
DARK_FRACTION = 0.40        # threshold between local background and local ink
END_FIT_POINTS = 60         # traced points used for each corner tangent
MIN_TRACE_POINTS = 120


def _require_8bit(gray: np.ndarray) -> None:
    finite = gray[np.isfinite(gray)]
    if finite.size == 0:
        raise ValueError("image contains no finite pixel values")
    if float(finite.max()) <= 1.0:
        raise ValueError(
            "image appears 0-1 normalized; this module expects 8-bit 0-255 values"
        )


def trace_edge(
    gray: np.ndarray, p0: tuple[float, float], p1: tuple[float, float]
) -> np.ndarray:
    """Follow the drawn rule between two seed points.

    The threshold is local to each perpendicular scan because the page shades
    from about 220 at the top to 165 at the bottom - a single global threshold
    cannot see the southern rules at all. Scans whose dark run is wider than
    MAX_INK_RUN are dropped as labels rather than rules; scans that find no ink
    contribute nothing rather than defaulting to the nominal line.
    """
    h, w = gray.shape
    x0, y0 = float(p0[0]), float(p0[1])
    x1, y1 = float(p1[0]), float(p1[1])
    length = float(np.hypot(x1 - x0, y1 - y0))
    if length < 1.0:
        raise ValueError("edge endpoints coincide")
    ux, uy = (x1 - x0) / length, (y1 - y0) / length
    nx, ny = -uy, ux
    offs = np.arange(-SEARCH_HALF_WIDTH, SEARCH_HALF_WIDTH + 1, dtype=float)

    pts = []
    for t in np.linspace(TRACE_MARGIN, 1.0 - TRACE_MARGIN, N_TRACE):
        cx, cy = x0 + t * length * ux, y0 + t * length * uy
        px = np.rint(cx + offs * nx).astype(int)
        py = np.rint(cy + offs * ny).astype(int)
        ok = (px >= 0) & (px < w) & (py >= 0) & (py < h)
        if ok.sum() < 10:
            continue
        vals = gray[py[ok], px[ok]]
        if not np.isfinite(vals).all():
            continue
        bg = float(np.percentile(vals, 80))
        thr = bg - DARK_FRACTION * (bg - float(vals.min()))
        dark = vals < thr
        n_dark = int(dark.sum())
        if n_dark == 0 or n_dark > MAX_INK_RUN:
            continue
        weights = thr - vals[dark]
        s = float(np.average(offs[ok][dark], weights=weights))
        pts.append((cx + s * nx, cy + s * ny))
    return np.asarray(pts, dtype=float)


def _fit_line(pts: np.ndarray) -> tuple[float, float, float]:
    """Total-least-squares line (a, b, c), a*x + b*y = c, a^2 + b^2 = 1."""
    mx, my = pts[:, 0].mean(), pts[:, 1].mean()
    u = pts - (mx, my)
    _, _, vt = np.linalg.svd(u, full_matrices=False)
    a, b = vt[-1]
    return float(a), float(b), float(a * mx + b * my)


def corner_pixel(tail: np.ndarray, head: np.ndarray) -> tuple[float, float]:
    """Corner where two traced edges meet, from their local tangents.

    A straight fit is valid here even though the edges are arcs: over the ~200 px
    spanned by END_FIT_POINTS, an arc carrying 30 px of sagitta across 2500 px
    departs from its chord by about 30 * (200/2500)^2, roughly 0.2 px.
    """
    if len(tail) < 8 or len(head) < 8:
        raise ValueError("too few traced points near the corner to fit tangents")
    a1, b1, c1 = _fit_line(tail)
    a2, b2, c2 = _fit_line(head)
    det = a1 * b2 - a2 * b1
    if abs(det) < 1e-6:
        raise ValueError("traced edges meet at too shallow an angle")
    return ((c1 * b2 - c2 * b1) / det, (a1 * c2 - a2 * c1) / det)


def _arc_fractions(pts: np.ndarray) -> np.ndarray:
    seg = np.hypot(np.diff(pts[:, 0]), np.diff(pts[:, 1]))
    cum = np.concatenate([[0.0], np.cumsum(seg)])
    if cum[-1] <= 0:
        raise ValueError("traced edge has zero length")
    return cum / cum[-1]


def build_perimeter_gcps(
    gray: np.ndarray, seeds: dict, per_edge: int = 60
) -> list[tuple[float, float, float, float]]:
    """Trace all six edges and emit (px, py, lon, lat) control points.

    Raises rather than returning a short list: a silently thin perimeter would
    produce a plausible-looking warp with no support where it is missing.
    """
    _require_8bit(gray)
    lookup = {name: (lon, lat) for name, lon, lat in UTAH_CORNERS}

    traces: dict[str, np.ndarray] = {}
    for name, (a, b) in EDGES.items():
        if a not in seeds or b not in seeds:
            raise KeyError(f"edge {name!r} needs seeds {a!r} and {b!r}")
        P = trace_edge(gray, tuple(seeds[a]), tuple(seeds[b]))
        if len(P) < MIN_TRACE_POINTS:
            raise ValueError(
                f"edge {name!r}: too few traced points ({len(P)} < {MIN_TRACE_POINTS})"
            )
        traces[name] = P

    gcps: list[tuple[float, float, float, float]] = []
    for name, (a, b) in EDGES.items():
        P = traces[name]
        lon_a, lat_a = lookup[a]
        lon_b, lat_b = lookup[b]
        f = _arc_fractions(P)
        idx = np.unique(
            np.rint(np.linspace(0, len(P) - 1, per_edge)).astype(int)
        )
        for i in idx:
            gcps.append(
                (
                    float(P[i, 0]),
                    float(P[i, 1]),
                    lon_a + f[i] * (lon_b - lon_a),
                    lat_a + f[i] * (lat_b - lat_a),
                )
            )

    seen = set()
    unique = []
    for g in gcps:
        key = (round(g[0], 3), round(g[1], 3))
        if key in seen:
            continue
        seen.add(key)
        unique.append(g)
    return unique
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `python3 -m pytest tests/test_perimeter.py -v`
Expected: 8 passed

- [ ] **Step 5: Run against the real raster and report**

```bash
cd tools/strat-charts && python3 -c "
import json, numpy as np
from PIL import Image
from strat_charts import perimeter
gray = np.asarray(Image.open('out/working_a.png').convert('L'), dtype=float)
seeds = json.load(open('data/corner_seeds.json'))['seeds']
g = perimeter.build_perimeter_gcps(gray, seeds, per_edge=60)
print('GCPs:', len(g))
import collections
c = collections.Counter()
for px, py, lon, lat in g:
    c[round(lat,4) if abs(lat-round(lat))<1e-6 else round(lon,4)] += 1
print('grouped by graticule value:', dict(c))
"
```

Report the GCP count and how many land on each graticule line. Then re-run with
every seed jittered ±10 px and confirm the GCP pixel positions move less than
2 px — seeds bracket an edge, they must not steer it.

- [ ] **Step 6: Update the README Superseded section**

Record, briefly: local corner refinement failed on corner clutter; global
straight-edge fitting then failed because the map is drawn in a conic-style
projection, with the measured width ratio 0.9632 vs cos-latitude 0.9604 as the
evidence; dense perimeter control replaced both. Someone will otherwise try
straight-line fitting again.

- [ ] **Step 7: Commit**

```bash
git add tools/strat-charts
git commit -m "feat(strat-charts): derive dense control from the traced boundary

The index map is drawn in a conic-style projection - E-W width between
the Nevada and Colorado meridians grows 2228.7 to 2313.7px from 40.6N to
37.8N, a ratio of 0.9632 against a cos-latitude prediction of 0.9604.
Straight-edge fitting was therefore wrong at the source, and six corner
GCPs cannot express a projection however well located.

Trace each drawn rule instead and emit a GCP every few pixels, assigning
geography by arc-length fraction - exact for longitude along a parallel
in a conic. A thin-plate spline over several hundred perimeter points
absorbs projection and page distortion together.

ALL-5470"
```

---

### Task 3: TPS warp to EPSG:4326

**Files:**
- Create: `tools/strat-charts/strat_charts/georef.py`
- Test: `tools/strat-charts/tests/test_georef.py`

**Interfaces:**
- Consumes: `boundary.UTAH_CORNERS`, `perimeter.build_perimeter_gcps`,
  `data/corner_seeds.json`.
- Produces:
  - `georef.build_gcps(corners: dict[str, tuple[float, float]]) -> list[georef.Gcp]`
    where `Gcp = namedtuple("Gcp", "name px py lon lat")`. It takes already-located
    pixel corners; finding them is `edges`' job, and keeping the two separate means
    `georef` has no opinion about image processing.
  - `georef.gcp_args(gcps: list[Gcp]) -> list[str]` — `gdal_translate` `-gcp` arguments.
  - `georef.warp(src_png: str, dst_tif: str, gcps: list[Gcp]) -> str` — runs
    `gdal_translate` then `gdalwarp -tps`, returns `dst_tif`. Raises `RuntimeError`
    on a non-zero exit, with stderr included.
  - `georef.pixel_to_lonlat(tif: str, points: list[tuple[float, float]]) -> list[tuple[float, float]]`
    — batch pixel→geographic via `gdaltransform`.

- [ ] **Step 1: Write the failing test**

`tests/test_georef.py`:

```python
import subprocess

import numpy as np
import pytest
from strat_charts import georef


def test_gcp_args_shape():
    gcps = [
        georef.Gcp("nw", 100.0, 200.0, -114.05, 42.0),
        georef.Gcp("se", 900.0, 800.0, -109.05, 37.0),
    ]
    args = georef.gcp_args(gcps)
    assert args.count("-gcp") == 2
    # gdal_translate wants: -gcp pixel line easting northing
    i = args.index("-gcp")
    assert args[i + 1 : i + 5] == ["100.0", "200.0", "-114.05", "42.0"]


def test_pixel_to_lonlat_against_a_real_raster(tmp_path):
    """Exercise the real gdaltransform invocation, not a mocked one.

    The first version of this function passed `-of output`, a flag that does
    not exist on GDAL 3.12 - so every call raised. Nothing caught it because
    no test ever ran the transform. Mocking this path would reproduce that
    blind spot exactly.
    """
    from PIL import Image

    src = tmp_path / "grid.png"
    Image.new("L", (100, 80), 128).save(src)
    tif = tmp_path / "grid.tif"
    subprocess.run(
        ["gdal_translate", "-a_srs", "EPSG:4326",
         "-a_ullr", "-114.0", "42.0", "-109.0", "37.0", str(src), str(tif)],
        check=True, capture_output=True,
    )
    (lon, lat), = georef.pixel_to_lonlat(str(tif), [(50.0, 40.0)])
    assert lon == pytest.approx(-111.5, abs=1e-6)
    assert lat == pytest.approx(39.5, abs=1e-6)


def test_pixel_to_lonlat_empty_input_is_a_noop():
    assert georef.pixel_to_lonlat("unused.tif", []) == []


def test_warp_reports_gdal_failure_loudly(tmp_path):
    """A GDAL failure must raise with stderr attached, never pass silently."""
    missing = str(tmp_path / "nope.png")
    gcps = [georef.Gcp("nw", 1.0, 1.0, -114.0, 42.0)]
    with pytest.raises(RuntimeError) as exc:
        georef.warp(missing, str(tmp_path / "out.tif"), gcps)
    assert "gdal" in str(exc.value).lower()


def test_build_gcps_pairs_every_named_corner():
    gcps = georef.build_gcps(
        {"nw": (250.5, 249.5)}, corner_lookup={"nw": (-114.05, 42.0)}
    )
    assert len(gcps) == 1
    assert gcps[0].px == 250.5
    assert gcps[0].lon == -114.05


def test_build_gcps_rejects_unknown_corner_name():
    """A typo must fail loudly, not silently drop a control point."""
    with pytest.raises(KeyError):
        georef.build_gcps({"bogus": (50.0, 50.0)}, corner_lookup={})


def test_build_gcps_is_deterministic_in_order():
    """gdal_translate takes GCPs positionally; a wandering order is a real bug."""
    lookup = {"nw": (-114.05, 42.0), "se": (-109.05, 37.0)}
    corners = {"se": (900.0, 800.0), "nw": (100.0, 200.0)}
    names = [g.name for g in georef.build_gcps(corners, corner_lookup=lookup)]
    assert names == sorted(names)
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `python3 -m pytest tests/test_georef.py -v`
Expected: FAIL — no module `strat_charts.georef`

- [ ] **Step 3: Implement `georef.py`**

```python
"""Warp the index-map raster to EPSG:4326 with a thin-plate spline.

TPS rather than a polynomial: the source is a hand-held photograph of a bound
page, so the distortion is a smooth but non-projective bend that a first- or
second-order polynomial cannot absorb.
"""

import subprocess
from collections import namedtuple

import numpy as np

from .boundary import UTAH_CORNERS

Gcp = namedtuple("Gcp", "name px py lon lat")


def _corner_lookup() -> dict[str, tuple[float, float]]:
    return {name: (lon, lat) for name, lon, lat in UTAH_CORNERS}


def build_gcps(
    corners: dict[str, tuple[float, float]],
    corner_lookup: dict[str, tuple[float, float]] | None = None,
) -> list[Gcp]:
    """Pair located pixel corners with their geographic coordinates.

    ``corners`` comes from ``edges.corners_from_edges``. Locating them is that
    module's job; this one only pairs pixels with geography.

    Sorted by name so the GCP order is stable across runs - gdal_translate
    consumes them positionally.

    Raises KeyError if a corner has no known coordinate - a typo must fail
    loudly rather than silently drop a control point.
    """
    lookup = _corner_lookup() if corner_lookup is None else corner_lookup
    gcps = []
    for name in sorted(corners):
        if name not in lookup:
            raise KeyError(f"no geographic coordinate for corner {name!r}")
        px, py = corners[name]
        lon, lat = lookup[name]
        gcps.append(Gcp(name, float(px), float(py), lon, lat))
    return gcps


def gcp_args(gcps: list[Gcp]) -> list[str]:
    """gdal_translate -gcp arguments: pixel line easting northing."""
    args: list[str] = []
    for g in gcps:
        args += ["-gcp", str(g.px), str(g.py), str(g.lon), str(g.lat)]
    return args


def _run(cmd: list[str]) -> str:
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(
            f"gdal command failed ({proc.returncode}): {' '.join(cmd)}\n{proc.stderr}"
        )
    return proc.stdout


def warp(src_png: str, dst_tif: str, gcps: list[Gcp]) -> str:
    """Attach GCPs then warp to EPSG:4326 with a thin-plate spline."""
    tagged = dst_tif.replace(".tif", "_gcp.tif")
    _run(
        ["gdal_translate", "-of", "GTiff", "-a_srs", "EPSG:4326"]
        + gcp_args(gcps)
        + [src_png, tagged]
    )
    _run(
        ["gdalwarp", "-r", "bilinear", "-tps", "-t_srs", "EPSG:4326",
         "-overwrite", tagged, dst_tif]
    )
    return dst_tif


def pixel_to_lonlat(
    tif: str, points: list[tuple[float, float]]
) -> list[tuple[float, float]]:
    """Batch pixel -> geographic transform through gdaltransform."""
    if not points:
        return []
    stdin = "\n".join(f"{x} {y}" for x, y in points) + "\n"
    proc = subprocess.run(
        ["gdaltransform", "-output_xy", tif],
        input=stdin, capture_output=True, text=True,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"gdaltransform failed: {proc.stderr}")
    out = []
    for line in proc.stdout.strip().splitlines():
        parts = line.split()
        out.append((float(parts[0]), float(parts[1])))
    if len(out) != len(points):
        raise RuntimeError(
            f"gdaltransform returned {len(out)} results for {len(points)} inputs"
        )
    return out
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `python3 -m pytest tests/test_georef.py -v`
Expected: 4 passed

- [ ] **Step 5: Produce the warped raster**

```bash
python3 -c "
import json, numpy as np
from PIL import Image
from strat_charts import perimeter, georef
seeds = json.load(open('data/corner_seeds.json'))['seeds']
gray = np.asarray(Image.open('out/working_a.png').convert('L'), dtype=float)
raw = perimeter.build_perimeter_gcps(gray, seeds, per_edge=60)
gcps = [georef.Gcp(f'p{i}', px, py, lon, lat) for i, (px, py, lon, lat) in enumerate(raw)]
print('GCPs:', len(gcps))
print(georef.warp('out/working_a.png', 'out/index_map.tif', gcps))
"
gdalinfo out/index_map.tif | head -20
```

Expected: a GeoTIFF whose corner coordinates bracket Utah.

- [ ] **Step 6: Commit**

```bash
git add tools/strat-charts
git commit -m "feat(strat-charts): warp the index map to EPSG:4326 with a thin-plate spline

GDAL failures raise with stderr attached rather than returning a
silently unusable raster.

ALL-5470"
```

---

### Task 4: Accuracy assessment

**Files:**
- Create: `tools/strat-charts/strat_charts/accuracy.py`
- Create: `tools/strat-charts/data/check_points.csv`
- Test: `tools/strat-charts/tests/test_accuracy.py`

**Interfaces:**
- Consumes: `georef.Gcp`, `georef.warp`, `georef.pixel_to_lonlat`.
- Produces:
  - `accuracy.haversine_m(lon1, lat1, lon2, lat2) -> float`
  - `accuracy.loo_residuals(gcps: list[Gcp], src_png: str, workdir: str) -> list[tuple[str, float]]`
    — leave-one-out cross-validation, returning `(corner_name, error_metres)`.
  - `accuracy.check_point_residuals(tif: str, checks: list[dict]) -> list[dict]`
    — each input `{name, px, py, lon, lat}`, each output adds `pred_lon`,
    `pred_lat`, `error_m`.

**Why two methods:** a TPS fits its control points exactly, so the GCP residuals
are zero by construction and say nothing. Leave-one-out cross-validation gives a
rigorous, fully self-contained estimate but only samples the boundary, where the
control is. Independent interior check points measure what actually matters —
whether a pin lands in the right place — and the two together bound the answer
from both sides.

- [ ] **Step 1: Write the failing test**

`tests/test_accuracy.py`:

```python
import math

import pytest
from strat_charts import accuracy


def test_haversine_known_distance():
    """One degree of latitude is about 111 km anywhere on the globe."""
    d = accuracy.haversine_m(-111.0, 40.0, -111.0, 41.0)
    assert 110_500 < d < 111_500


def test_haversine_zero_for_identical_points():
    assert accuracy.haversine_m(-111.9, 40.76, -111.9, 40.76) == pytest.approx(0.0)


def test_haversine_is_symmetric():
    a = accuracy.haversine_m(-114.0, 42.0, -109.0, 37.0)
    b = accuracy.haversine_m(-109.0, 37.0, -114.0, 42.0)
    assert a == pytest.approx(b)


def test_check_point_residuals_computes_error(monkeypatch):
    from strat_charts import georef

    monkeypatch.setattr(
        georef, "pixel_to_lonlat", lambda tif, pts: [(-111.9, 40.76)]
    )
    rows = accuracy.check_point_residuals(
        "unused.tif",
        [{"name": "slc", "px": 10.0, "py": 20.0, "lon": -111.891, "lat": 40.7608}],
    )
    assert len(rows) == 1
    assert rows[0]["error_m"] > 0
    assert rows[0]["error_m"] < 2000


def test_check_point_residuals_rejects_length_mismatch(monkeypatch):
    from strat_charts import georef

    monkeypatch.setattr(georef, "pixel_to_lonlat", lambda tif, pts: [])
    with pytest.raises(RuntimeError):
        accuracy.check_point_residuals(
            "unused.tif",
            [{"name": "slc", "px": 1.0, "py": 1.0, "lon": -111.9, "lat": 40.8}],
        )
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `python3 -m pytest tests/test_accuracy.py -v`
Expected: FAIL — no module `strat_charts.accuracy`

- [ ] **Step 3: Implement `accuracy.py`**

```python
"""Measure how good the georeference actually is.

Two independent estimates, because neither alone is honest: leave-one-out
cross-validation is rigorous but only samples the boundary, and interior check
points measure real pin accuracy but depend on an external gazetteer.
"""

import math
from pathlib import Path

from . import georef

EARTH_RADIUS_M = 6_371_008.8   # IUGG mean radius


def haversine_m(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    """Great-circle distance in metres."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(a))


def loo_residuals(
    gcps: list[georef.Gcp], src_png: str, workdir: str
) -> list[tuple[str, float]]:
    """Leave-one-out cross-validation over the control points.

    For each GCP: warp using the others, predict the held-out point's position,
    and measure the error against its known coordinate.

    Raises ValueError with fewer than four GCPs, where a TPS is not
    meaningfully constrained and the numbers would be misleading.
    """
    if len(gcps) < 4:
        raise ValueError(f"need at least 4 GCPs for cross-validation, got {len(gcps)}")

    Path(workdir).mkdir(parents=True, exist_ok=True)
    out = []
    for i, held in enumerate(gcps):
        rest = [g for j, g in enumerate(gcps) if j != i]
        tif = str(Path(workdir) / f"loo_{held.name}.tif")
        georef.warp(src_png, tif, rest)
        (pred_lon, pred_lat), = georef.pixel_to_lonlat(tif, [(held.px, held.py)])
        out.append((held.name, haversine_m(pred_lon, pred_lat, held.lon, held.lat)))
    return out


def check_point_residuals(tif: str, checks: list[dict]) -> list[dict]:
    """Error at independent check points whose true coordinates are known."""
    preds = georef.pixel_to_lonlat(tif, [(c["px"], c["py"]) for c in checks])
    if len(preds) != len(checks):
        raise RuntimeError(
            f"transform returned {len(preds)} results for {len(checks)} check points"
        )
    rows = []
    for c, (plon, plat) in zip(checks, preds):
        rows.append(
            {
                **c,
                "pred_lon": plon,
                "pred_lat": plat,
                "error_m": haversine_m(plon, plat, c["lon"], c["lat"]),
            }
        )
    return rows
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `python3 -m pytest tests/test_accuracy.py -v`
Expected: 5 passed

- [ ] **Step 5: Build the check-point table**

Choose 10–15 of the 123 localities that are unambiguous named places with
published coordinates — for example Wendover, St. George, Moab, Logan, Ogden,
Provo, Kanab, Richfield, Vernal, Green River, Monticello.

**Source every coordinate from the USGS GNIS gazetteer and cite it.** Do not
write down a remembered value. Record in `data/check_points.csv`:

```csv
name,chart_id,lon,lat,source,retrieved
Wendover,16,,,GNIS,2026-08-01
```

Fill `px`/`py` during Task 5, once label anchors are digitized.

**Note the known bias and record it in the README:** the digitized anchor is the
*number glyph* on the index map, which the book places near — not exactly on —
the locality. Check-point error therefore includes the cartographer's label
offset. That is genuine uncertainty for this dataset, so it belongs in the
reported figure rather than being quietly subtracted out.

- [ ] **Step 6: Commit**

```bash
git add tools/strat-charts
git commit -m "feat(strat-charts): measure georeference accuracy two independent ways

Leave-one-out cross-validation over the control points, plus residuals
against gazetteer-sourced check points. A TPS fits its GCPs exactly, so
GCP residuals alone would be zero and meaningless.

ALL-5470"
```

---

### Task 5: Digitize the 123 label anchors

**Files:**
- Create: `tools/strat-charts/strat_charts/digitize.py`
- Create: `tools/strat-charts/data/chart_names.csv`
- Test: `tools/strat-charts/tests/test_digitize.py`

**Interfaces:**
- Consumes: `georef.pixel_to_lonlat`.
- Produces:
  - `digitize.load_chart_names(path: str) -> dict[int, str]` — chart id → filename stem.
  - `digitize.anchors_to_localities(anchors: dict[int, tuple[float, float]], tif: str, names: dict[int, str]) -> list[dict]`
    — rows with `chart_id`, `index_label`, `source_filename`, `longitude`, `latitude`.

- [ ] **Step 1: Build the canonical name list from the image filenames**

The filenames are the only complete, machine-readable list of all 123. Drop the
`" 2"` / `" 3"` duplicate variants — verified in the spec as older revisions.

```bash
SRC="$HOME/Documents/temp_data/drive-download-20260801T222738Z-1-001"
python3 - <<'PY'
import csv, os, re
src = os.path.expanduser("~/Documents/temp_data/drive-download-20260801T222738Z-1-001")
rows = {}
for f in sorted(os.listdir(src)):
    m = re.match(r"^(\d{3})_(.+)\.jpg$", f)
    if not m:
        continue
    stem = m.group(2)
    if re.search(r" \d$", stem):      # " 2" / " 3" duplicate variants
        continue
    rows[int(m.group(1))] = f
assert len(rows) == 123, f"expected 123 charts, got {len(rows)}"
with open("data/chart_names.csv", "w", newline="") as fh:
    w = csv.writer(fh)
    w.writerow(["chart_id", "source_filename"])
    for k in sorted(rows):
        w.writerow([k, rows[k]])
print("wrote", len(rows))
PY
```

Expected: `wrote 123`. If the assertion trips, stop — the file set changed.

- [ ] **Step 2: Write the failing test**

`tests/test_digitize.py`:

```python
from pathlib import Path

import pytest
from strat_charts import digitize

DATA = Path(__file__).resolve().parents[1] / "data"


def test_chart_names_has_123_entries():
    names = digitize.load_chart_names(str(DATA / "chart_names.csv"))
    assert len(names) == 123
    assert set(names) == set(range(1, 124)), "chart ids must be 1..123 with no gaps"


def test_chart_names_excludes_duplicate_variants():
    names = digitize.load_chart_names(str(DATA / "chart_names.csv"))
    for fn in names.values():
        assert " 2.jpg" not in fn and " 3.jpg" not in fn


def test_chart_70_is_the_plate():
    names = digitize.load_chart_names(str(DATA / "chart_names.csv"))
    assert "Uinta Basin Maps" in names[70]


def test_anchors_to_localities_maps_every_anchor(monkeypatch):
    from strat_charts import georef

    monkeypatch.setattr(
        georef, "pixel_to_lonlat", lambda tif, pts: [(-111.9, 40.7)] * len(pts)
    )
    rows = digitize.anchors_to_localities(
        {1: (10.0, 20.0), 2: (30.0, 40.0)},
        "unused.tif",
        {1: "001_Albion.jpg", 2: "002_RaftRiver.jpg"},
    )
    assert len(rows) == 2
    assert rows[0]["chart_id"] == 1
    assert rows[0]["source_filename"] == "001_Albion.jpg"
    assert rows[0]["longitude"] == -111.9


def test_anchors_without_a_name_raise(monkeypatch):
    """An anchor with no matching chart must fail, not be dropped."""
    from strat_charts import georef

    monkeypatch.setattr(georef, "pixel_to_lonlat", lambda tif, pts: [(-111.9, 40.7)])
    with pytest.raises(KeyError):
        digitize.anchors_to_localities({999: (1.0, 2.0)}, "unused.tif", {})
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `python3 -m pytest tests/test_digitize.py -v`
Expected: FAIL — no module `strat_charts.digitize`

- [ ] **Step 4: Implement `digitize.py`**

```python
"""Turn digitized label anchors into locality rows."""

import csv
import re

from . import georef


def load_chart_names(path: str) -> dict[int, str]:
    """Read the canonical chart id -> filename map."""
    out: dict[int, str] = {}
    with open(path, newline="") as fh:
        for row in csv.DictReader(fh):
            out[int(row["chart_id"])] = row["source_filename"]
    return out


def index_label(source_filename: str) -> str:
    """Human label from the filename stem: '011_Lucin.jpg' -> 'Lucin'.

    This is the *filename* label, retained as provenance. The authoritative
    title comes from the chart image itself and is filled in later.
    """
    stem = re.sub(r"^\d{3}_", "", source_filename).removesuffix(".jpg")
    return re.sub(r"(?<=[a-z])(?=[A-Z])", " ", stem).strip()


def anchors_to_localities(
    anchors: dict[int, tuple[float, float]], tif: str, names: dict[int, str]
) -> list[dict]:
    """Transform pixel anchors to geographic locality rows.

    Raises KeyError if an anchor has no corresponding chart - a stray anchor
    means the digitization is wrong and must not be silently discarded.
    """
    ids = sorted(anchors)
    missing = [i for i in ids if i not in names]
    if missing:
        raise KeyError(f"anchors with no chart entry: {missing}")

    coords = georef.pixel_to_lonlat(tif, [anchors[i] for i in ids])
    rows = []
    for chart_id, (lon, lat) in zip(ids, coords):
        fn = names[chart_id]
        rows.append(
            {
                "chart_id": chart_id,
                "index_label": index_label(fn),
                "source_filename": fn,
                "longitude": lon,
                "latitude": lat,
            }
        )
    return rows
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `python3 -m pytest tests/test_digitize.py -v`
Expected: 5 passed

- [ ] **Step 6: Digitize the anchors**

The numbers on the index map are the markers — there are no separate dots. Work
in tiles over the warped raster, reading each number's centroid.

Procedure, per tile:
1. Cut the warped raster into a 4 × 4 grid of overlapping tiles at 2× zoom.
2. For each tile, record the pixel centroid of every visible chart number.
3. Convert tile-local pixels back to full-raster pixels.
4. Accumulate into `data/anchors.json` as `{chart_id: [px, py]}`.

**Cross-check before moving on:** every chart id 1–123 must appear exactly once.
The name beside each digitized number must match `chart_names.csv` for that id —
this catches transposed digits, which are the likely failure mode. Where the
filename and the index-map label genuinely differ (chart 72 is `UintaBasin` in
the filename and `Ouray` on the map), record the discrepancy rather than
"correcting" either.

- [ ] **Step 7: Verify anchor completeness**

```bash
python3 -c "
import json
a = json.load(open('data/anchors.json'))
ids = sorted(int(k) for k in a)
assert ids == list(range(1, 124)), f'missing: {set(range(1,124)) - set(ids)}'
print('all 123 anchors present')
"
```

Expected: `all 123 anchors present`

- [ ] **Step 8: Commit**

```bash
git add tools/strat-charts
git commit -m "feat(strat-charts): digitize the 123 index-map label anchors

Anchors are cross-checked against the canonical chart list so a
transposed digit fails loudly instead of silently moving a pin.

ALL-5470"
```

---

### Task 6: QA overlay and locality CSV

**Files:**
- Create: `tools/strat-charts/strat_charts/overlay.py`
- Test: `tools/strat-charts/tests/test_overlay.py`

**Interfaces:**
- Consumes: `boundary.UTAH_CORNERS`, `digitize.anchors_to_localities`, `accuracy.*`.
- Produces:
  - `overlay.utah_outline() -> list[tuple[float, float]]` — closed boundary ring.
  - `overlay.render(localities, checks, dst_png) -> str` — QA figure.
  - `overlay.write_localities_csv(rows, dst) -> str`.

- [ ] **Step 1: Write the failing test**

`tests/test_overlay.py`:

```python
import csv

import pytest
from strat_charts import overlay


def test_outline_is_closed():
    ring = overlay.utah_outline()
    assert ring[0] == ring[-1], "ring must close"
    assert len(ring) == 7, "six corners plus the closing point"


def test_write_localities_csv_roundtrips(tmp_path):
    rows = [
        {"chart_id": 1, "index_label": "Albion", "source_filename": "001_Albion.jpg",
         "longitude": -113.6, "latitude": 42.4},
    ]
    dst = tmp_path / "localities.csv"
    overlay.write_localities_csv(rows, str(dst))
    back = list(csv.DictReader(open(dst)))
    assert len(back) == 1
    assert back[0]["chart_id"] == "1"
    assert float(back[0]["longitude"]) == pytest.approx(-113.6)


def test_write_localities_csv_rejects_empty():
    """Writing an empty locality set means something upstream failed."""
    with pytest.raises(ValueError, match="no localities"):
        overlay.write_localities_csv([], "unused.csv")
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `python3 -m pytest tests/test_overlay.py -v`
Expected: FAIL — no module `strat_charts.overlay`

- [ ] **Step 3: Implement `overlay.py`**

```python
"""QA rendering and locality output.

The overlay is the artifact a human judges. Utah's outline is drawn from the
same control coordinates used to georeference, so a systematically shifted or
sheared warp is immediately visible as pins sitting outside the state.
"""

import csv

import matplotlib
matplotlib.use("Agg")            # no display in this environment
import matplotlib.pyplot as plt  # noqa: E402

from .boundary import UTAH_CORNERS  # noqa: E402

CSV_FIELDS = [
    "chart_id", "index_label", "source_filename", "longitude", "latitude",
]


def utah_outline() -> list[tuple[float, float]]:
    """Closed boundary ring in (lon, lat)."""
    ring = [(lon, lat) for _, lon, lat in UTAH_CORNERS]
    return ring + [ring[0]]


def render(localities: list[dict], checks: list[dict], dst_png: str) -> str:
    """Draw the state outline, the digitized pins, and check-point errors."""
    ring = utah_outline()
    fig, ax = plt.subplots(figsize=(10, 13))
    ax.plot([p[0] for p in ring], [p[1] for p in ring], "-", lw=1.2, color="#444")

    ax.scatter(
        [r["longitude"] for r in localities],
        [r["latitude"] for r in localities],
        s=14, color="#c0392b", zorder=3,
    )
    for r in localities:
        ax.annotate(
            str(r["chart_id"]), (r["longitude"], r["latitude"]),
            fontsize=5, xytext=(2, 2), textcoords="offset points",
        )

    for c in checks:
        ax.plot(
            [c["lon"], c["pred_lon"]], [c["lat"], c["pred_lat"]],
            "-", color="#2980b9", lw=1.0, zorder=4,
        )
        ax.scatter([c["lon"]], [c["lat"]], s=26, marker="x",
                   color="#2980b9", zorder=5)

    ax.set_aspect(1.0 / 0.75)          # rough lat/lon aspect at 40N
    ax.set_xlabel("longitude")
    ax.set_ylabel("latitude")
    ax.set_title("Stratigraphic chart localities - QA overlay (ALL-5470)")
    fig.tight_layout()
    fig.savefig(dst_png, dpi=200)
    plt.close(fig)
    return dst_png


def write_localities_csv(rows: list[dict], dst: str) -> str:
    """Write the locality table. Refuses to write an empty file."""
    if not rows:
        raise ValueError("no localities to write - upstream digitization failed")
    with open(dst, "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=CSV_FIELDS)
        w.writeheader()
        for r in rows:
            w.writerow({k: r[k] for k in CSV_FIELDS})
    return dst
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `python3 -m pytest tests/test_overlay.py -v`
Expected: 3 passed

- [ ] **Step 5: Run the full suite**

Run: `python3 -m pytest tests/ -v`
Expected: all pass. Record the count.

- [ ] **Step 6: Produce the Phase 0 deliverables**

Generate `out/localities.csv`, `out/qa_overlay.png`, and a residual summary
covering both the leave-one-out figures and the check-point errors — min, median,
max, and RMSE in metres for each.

- [ ] **Step 7: Write the residual report**

`tools/strat-charts/RESIDUALS.md`: the two tables, the method, and a plain
statement of what the numbers mean for downstream use, including the label-offset
bias noted in Task 4 Step 5. Whoever reads it should be able to decide whether
the accuracy is fit for purpose without re-deriving anything.

- [ ] **Step 8: Commit**

```bash
git add tools/strat-charts
git commit -m "feat(strat-charts): add QA overlay, locality CSV, and residual report

Phase 0 deliverable: 123 georeferenced localities with a measured
accuracy statement from cross-validation and independent check points.

ALL-5470"
```

---

## Gate

**Stop here.** Phase 0 ends with the residual report and QA overlay in front of a
human. Extraction (Phase 1) does not begin until those are reviewed, because a
bad warp invalidates every point and is far cheaper to find now than after 122
charts have been transcribed.

If residuals are acceptable, the next plan covers the five-chart extraction
pilot. If not, the likely remedies in order: use `IMG_4167` instead of
`IMG_4168`, add interior control from the lake outlines, or reconsider deriving
coordinates from place names — the option originally recommended in the spec
discussion.

## Self-Review

**Spec coverage.** This plan covers the spec's Georeferencing section and the
locality-table columns that Phase 0 can populate (`chart_id`, `index_label`,
`source_filename`, `longitude`, `latitude`, and the inputs to
`georef_residual_m`). Deliberately deferred: `chart_title` and `chart_type`
require reading the chart images (Phase 1); `oldest_period` / `youngest_period` /
`unit_count` derive from unit rows (Phase 2); `image_url` / `thumbnail_url`
require the Firebase upload (Phase 3); citation columns are constants added at
CSV assembly. The `strat_chart_units` table, portal layer, popup, and filtering
are all out of scope for Phase 0 by design.

**Placeholders.** The only intentional blanks are `boundary.UTAH_CORNERS` values
and `data/corner_seeds.json` — both are *measured inputs*, and both have an
explicit step that produces them plus a test that fails while they are unfilled
(`test_corners_bracket_utah`, `test_seed_file_has_all_six_corners`). No step says
"add error handling" or "write tests for the above".

**Type consistency.** `Gcp` is `(name, px, py, lon, lat)` throughout. Locality
rows use `longitude`/`latitude`; check-point rows use `lon`/`lat` plus
`pred_lon`/`pred_lat` — different shapes on purpose, and `overlay.render`
consumes each with its own key names. `georef.pixel_to_lonlat` returns
`(lon, lat)` and every caller unpacks it in that order.
