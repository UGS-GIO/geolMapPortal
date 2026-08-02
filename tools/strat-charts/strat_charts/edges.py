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
