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
