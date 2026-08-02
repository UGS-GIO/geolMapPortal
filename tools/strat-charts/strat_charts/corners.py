"""Refine hand-placed corner seeds to the sub-pixel line intersection.

A thin-plate spline reproduces its control points exactly, so GCP quality sets
the ceiling on the whole georeference. Hand-placed seeds carry several pixels of
hand-eye error; fitting the two drawn boundary lines and intersecting them
removes it and makes the result reproducible.
"""

import numpy as np

DARK_THRESHOLD = 140.0

# A limb needs enough pixels for the fit to mean anything; below this the
# window is not looking at a corner.
MIN_LIMB_PIXELS = 10

# Alternating assignment converges in two or three passes on real corners; the
# cap only exists so an oscillating assignment cannot loop forever.
MAX_REASSIGN_PASSES = 12

Line = tuple[float, float, float]


def _fit_line(xs: np.ndarray, ys: np.ndarray) -> Line:
    """Total-least-squares line as (a, b, c) with a*x + b*y = c, a^2 + b^2 = 1.

    TLS rather than ordinary least squares because these lines can be near
    vertical, where a y-on-x fit blows up.
    """
    mx, my = xs.mean(), ys.mean()
    u = np.column_stack([xs - mx, ys - my])
    _, _, vt = np.linalg.svd(u, full_matrices=False)
    a, b = vt[-1]                      # normal to the best-fit direction
    return float(a), float(b), float(a * mx + b * my)


def _distance(line: Line, xs: np.ndarray, ys: np.ndarray) -> np.ndarray:
    """Perpendicular distance from each point to ``line`` (its normal is unit)."""
    a, b, c = line
    return np.abs(a * xs + b * ys - c)


def _fit_limbs(
    xs: np.ndarray, ys: np.ndarray, horiz: np.ndarray, seed: tuple[int, int]
) -> tuple[Line, Line]:
    """Fit one line to each limb of the current assignment.

    Raises ValueError if either limb is too small to fit, which means the window
    is sitting on a single line rather than on a corner.
    """
    vert = ~horiz
    if horiz.sum() < MIN_LIMB_PIXELS or vert.sum() < MIN_LIMB_PIXELS:
        raise ValueError(f"only one boundary limb near seed {seed}")
    return _fit_line(xs[horiz], ys[horiz]), _fit_line(xs[vert], ys[vert])


def refine_corner(
    gray: np.ndarray, seed: tuple[int, int], window: int = 60
) -> tuple[float, float]:
    """Return the sub-pixel corner nearest ``seed``.

    Splits the dark pixels in the window into two groups by orientation, fits a
    line to each, and intersects them.

    Raises ValueError if the window holds no boundary pixels, if only one limb
    is present, or if the two fitted lines are near parallel (their intersection
    would be unstable).
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

    # Seed the split by orientation: relative to the seed, one limb varies
    # mostly in x, the other mostly in y.
    dx = np.abs(xs - sx)
    dy = np.abs(ys - sy)
    horiz = dx >= dy

    # That first split is only a guess, and it is wrong exactly where it matters
    # most: pixels of one limb that lie close to the seed get charged to the
    # other limb, which tilts that limb's fit and drags the intersection off the
    # drawn corner. Reassign each pixel to whichever fitted line it actually
    # lies nearer, refit, and repeat until the assignment stops changing. The
    # answer then depends on the drawn lines rather than on where the seed
    # happened to be dropped.
    line_h, line_v = _fit_limbs(xs, ys, horiz, seed)
    for _ in range(MAX_REASSIGN_PASSES):
        nearer_h = _distance(line_h, xs, ys) <= _distance(line_v, xs, ys)
        if np.array_equal(nearer_h, horiz):
            break
        horiz = nearer_h
        line_h, line_v = _fit_limbs(xs, ys, horiz, seed)

    a1, b1, c1 = line_h
    a2, b2, c2 = line_v

    det = a1 * b2 - a2 * b1
    if abs(det) < 1e-6:
        raise ValueError(f"boundary limbs near seed {seed} are parallel")

    x = (c1 * b2 - c2 * b1) / det
    y = (a1 * c2 - a2 * c1) / det
    return float(x), float(y)
