import json
from pathlib import Path

import numpy as np
import pytest
from strat_charts import perimeter
from strat_charts.edges import EDGES


def _conic_map():
    """A synthetic Utah in an equidistant conic projection, drawn onto a raster.

    Meridians are straight lines converging on a pole and parallels are
    concentric circular arcs, reproducing the real figure's geometry - so a test
    that passes here is not passing by accident on a rectangle. E-W width between
    the two meridian edges grows from 842 px at 42N to 905 px at 37N, a ratio of
    0.930 over five degrees, the same sense and order as the 0.9632 measured over
    2.8 degrees on the real raster. Each parallel carries about 6 px of sagitta.

    An earlier form of this fixture used ``x = k * (lon - lon0) * cos(lat)``,
    ``y = m * (lat0 - lat)``. That converges meridians but leaves every parallel
    exactly horizontal, so the curved-parallel assertion below measured a
    deviation of precisely 0.0 and no tracer could have satisfied it.
    """
    img = np.full((1500, 1300), 255.0)
    lat0 = np.radians(39.5)                  # standard parallel
    lon0 = -111.55
    n = np.sin(lat0)                         # cone constant
    G = 1.0 / np.tan(lat0) + lat0
    rho0 = G - lat0
    scale = 13000.0

    def project(lon, lat):
        rho = G - np.radians(lat)
        theta = n * np.radians(lon - lon0)
        x = 650.0 + scale * rho * np.sin(theta)
        y = 750.0 - scale * (rho0 - rho * np.cos(theta))
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


def test_gcps_land_where_their_geography_actually_projects_to():
    """The fixture knows where every (lon, lat) belongs; check the pixels against it.

    Everything else in this file measures self-consistency - that the answer does
    not move when the seeds do, that no point sits on blank paper. None of it
    would catch a trace that is stable, ink-backed and 20 px off. ``project`` is
    ground truth for the synthetic map and is the only assertion here that can.

    2.5 px against a measured 1.52 px worst case. The residual is real: the
    emitted point is placed at a fraction of *traced arc length*, and a polyline
    through noisy samples is slightly longer than the curve it follows, so the
    fractions drift a little from their true positions along the drawn line.
    """
    img, seeds, project, _ = _conic_map()
    gcps = perimeter.build_perimeter_gcps(img, seeds, per_edge=40)
    error = [np.hypot(px - x, py - y)
             for px, py, lon, lat in gcps
             for x, y in [project(lon, lat)]]
    assert max(error) < 2.5, (
        f"control points miss their true projected position by up to "
        f"{max(error):.2f} px (mean {np.mean(error):.2f})"
    )


def test_rejects_normalized_image_loudly():
    img, seeds, _, _ = _conic_map()
    with pytest.raises(ValueError, match="8-bit"):
        perimeter.build_perimeter_gcps(img / 255.0, seeds)


def test_blank_image_raises():
    _, seeds, _, _ = _conic_map()
    with pytest.raises(ValueError, match="too few"):
        perimeter.build_perimeter_gcps(np.full((1500, 1300), 255.0), seeds)


def _max_shift(one, other):
    """Largest movement of control points that both runs actually emitted.

    Points are matched on the graticule coordinate they carry, not on list
    position: a run may legitimately emit fewer points, because a GCP with no
    traced ink behind it is dropped rather than interpolated across the gap.
    """
    lookup = {(round(g[2], 9), round(g[3], 9)): g for g in other}
    shared = [
        (g, lookup[k]) for g in one if (k := (round(g[2], 9), round(g[3], 9))) in lookup
    ]
    assert len(shared) > len(one) // 2, (
        f"only {len(shared)} of {len(one)} control points survived in both runs"
    )
    return max(np.hypot(a[0] - b[0], a[1] - b[1]) for a, b in shared)


def _clutter_touching(img, project):
    """Stamp label-sized blobs that touch the south and Nevada rules.

    Ink lying merely *near* a rule cannot fool this tracer - it keeps the run
    nearest where the rule is predicted to be, and a blob 10 px away never wins.
    Ink that touches the rule is the real hazard, because it merges with the rule
    into one run and drags its centroid. That is what a place name crossing a
    boundary does on the real page.
    """
    img = img.copy()
    for lon0 in (-113.4, -112.2, -110.4):
        for lon in np.linspace(lon0, lon0 + 0.20, 400):
            x, y = project(lon, 37.0)
            img[int(y) - 20:int(y), int(x)] = 40.0
    for lat0 in (38.2, 39.6, 41.0):
        for lat in np.linspace(lat0, lat0 + 0.18, 400):
            x, y = project(-114.05, lat)
            img[int(y), int(x) + 1:int(x) + 21] = 40.0
    return img


def _occlude_a_stretch(img, project):
    """Blot out a stretch of the south rule entirely, as a heavy label would."""
    img = img.copy()
    for lon in np.linspace(-112.5, -112.3, 400):
        x, y = project(lon, 37.0)
        img[int(y) - 12:int(y) + 12, int(x)] = 30.0
    return img


def test_clutter_touching_a_rule_does_not_move_the_gcps():
    img, seeds, project, _ = _conic_map()
    clean = perimeter.build_perimeter_gcps(img, seeds, per_edge=40)
    dirty = perimeter.build_perimeter_gcps(_clutter_touching(img, project), seeds,
                                           per_edge=40)
    d = _max_shift(clean, dirty)
    assert d < 1.0, f"labels steered the control points (max {d:.2f}px)"
    # The clutter costs points as well as leaving the rest in place: where a blob
    # merges with the rule the run is too wide to accept, so those scans yield
    # nothing and the points over them are dropped. Measured at 10 of 240. The
    # bound is here so a regression that halves the output cannot pass on the
    # strength of the survivors alone.
    assert len(dirty) >= len(clean) - 12, (
        f"clutter cost {len(clean) - len(dirty)} of {len(clean)} control points"
    )


def test_the_clutter_is_genuinely_threatening(monkeypatch):
    """Guard against the test above passing because the clutter is harmless.

    Two independent defenses reject a label merged into a rule: the wide-run
    filter drops the merged run outright, and the accept-tolerance drops its
    displaced centroid as an outlier against the fitted model. Either alone
    suffices - 0.06 px and 0.15 px respectively - so both have to come off to
    show the fixture bites at all. With both off the same blobs drag the control
    points 9.5 px, which is what they would do to a tracer without either guard.
    """
    img, seeds, project, _ = _conic_map()
    clean = perimeter.build_perimeter_gcps(img, seeds, per_edge=40)
    monkeypatch.setattr(perimeter, "MAX_RULE_WIDTH", 10_000)
    monkeypatch.setattr(perimeter, "ACCEPT_TOLERANCE", 1e9)
    dirty = perimeter.build_perimeter_gcps(_clutter_touching(img, project), seeds,
                                           per_edge=40)
    d = _max_shift(clean, dirty)
    assert d > 1.0, f"clutter had no effect even undefended (max {d:.2f}px)"


def test_an_occluded_stretch_costs_only_its_own_points():
    """A blot removes control points where it lies and leaves the rest alone.

    Not "bridged" - the blot is 24 px tall, so every run across it exceeds
    MAX_RULE_WIDTH and none is accepted. The points over the blot are *dropped*,
    which is the point of the ink test. What is asserted here is that losing them
    does not disturb the survivors: the arc-length parameterisation of the rest of
    the edge must not be rescaled by the hole.
    """
    img, seeds, project, _ = _conic_map()
    clean = perimeter.build_perimeter_gcps(img, seeds, per_edge=40)
    blotted = perimeter.build_perimeter_gcps(_occlude_a_stretch(img, project), seeds,
                                             per_edge=40)
    d = _max_shift(clean, blotted)
    assert d < 1.5, f"a blotted stretch displaced the control points ({d:.2f}px)"
    assert len(blotted) < len(clean), "the blot cost no control points at all"
    assert len(blotted) > len(clean) - 8, (
        f"the blot cost {len(clean) - len(blotted)} control points; it only "
        "covers about two"
    )


def test_the_occlusion_really_removes_ink():
    """The bridging test above is only meaningful if the blot destroys scans."""
    img, seeds, project, _ = _conic_map()
    a, b = tuple(seeds["se"]), tuple(seeds["sw"])
    clean = perimeter.trace_edge(img, a, b)
    blotted = perimeter.trace_edge(_occlude_a_stretch(img, project), a, b)
    assert len(blotted) < len(clean) - 20, (
        f"the blot removed no scans ({len(clean)} -> {len(blotted)}); "
        "the fixture is inert"
    )


_ROOT = Path(__file__).resolve().parents[1]
_RASTER = _ROOT / "out" / "working_a.png"
_SEEDS = _ROOT / "data" / "corner_seeds.json"

# Constant seed offsets, in pixels. Every seed moves by the same vector, so the
# perimeter is bracketed just as well as before and only the *starting guess*
# changes - which is the one thing that must not reach the answer.
_JITTERS = [(10, 10), (-10, -10), (10, -10), (-10, 10), (0, 10), (7, -9)]


def _real_raster():
    """The photographed index map, or a skip if it has not been built.

    ``out/`` is gitignored, so a fresh clone has no raster until Task 1 has run.
    Skipping is right here; asserting nothing is not, which is why this test
    exists at all - see its docstring.
    """
    if not _RASTER.exists():
        pytest.skip(f"{_RASTER} not built; run the orientation step first")
    from PIL import Image

    gray = np.asarray(Image.open(_RASTER).convert("L"), dtype=float)
    return gray, json.loads(_SEEDS.read_text())["seeds"]


def test_seed_jitter_does_not_move_the_gcps_on_the_real_raster():
    """The synthetic fixture is too easy; this is the measurement that counts.

    ``test_seed_jitter_does_not_move_the_gcps`` passed on the conic fixture while
    the real raster was moving control points 2.9 px, because the fixture's rules
    are unbroken, uniformly dark and uncluttered. Three times in this project a
    synthetic map has agreed with a change that reality then rejected. So the
    real raster gets asserted on directly, and skips rather than passes when it
    is absent.

    Two assertions, and the second is deliberately weaker than "the count is
    unchanged". Whether a control point clears the ink test is a discrete
    decision taken at a continuously varying distance, so a sample sitting within
    a pixel of MAX_INK_GAP_PX of the end of a stretch of rule can fall either way
    under jitter. Measured over ten offsets the count moves between 290 and 294 -
    at most 1.4% - while every point common to two runs moves under 0.55 px. The
    invariant worth pinning is that the points that *are* emitted do not move and
    that the two runs describe nearly the same set; demanding an exactly equal
    count would only buy that by loosening the ink test until it stopped
    discriminating, which is the bug this test was written for.
    """
    gray, seeds = _real_raster()
    base = perimeter.build_perimeter_gcps(gray, seeds, per_edge=60)
    assert len(base) > 250, f"only {len(base)} control points from the real raster"

    for dx, dy in _JITTERS:
        jittered = {k: [v[0] + dx, v[1] + dy] for k, v in seeds.items()}
        moved = perimeter.build_perimeter_gcps(gray, jittered, per_edge=60)

        shift = _max_shift(base, moved)
        assert shift < 2.0, (
            f"offset ({dx:+d}, {dy:+d}) steered the control points "
            f"{shift:.2f} px; seeds must only bracket an edge"
        )

        keys = {(round(g[2], 9), round(g[3], 9)) for g in base}
        shared = keys & {(round(g[2], 9), round(g[3], 9)) for g in moved}
        assert abs(len(moved) - len(base)) <= 3, (
            f"offset ({dx:+d}, {dy:+d}) changed the control point count "
            f"{len(base)} -> {len(moved)}"
        )
        assert len(shared) >= len(base) - 3, (
            f"offset ({dx:+d}, {dy:+d}) replaced {len(base) - len(shared)} "
            "control points rather than reproducing them"
        )


def test_every_real_raster_gcp_has_ink_behind_it():
    """No control point may sit on a stretch of edge the cartographer left blank.

    Measured against the raster, not against the module's own trace: each point
    is read straight out of the original pixels and has to have ink under it. A
    point interpolated across a gap - which is what the Wyoming meridian's 199 px
    break used to produce - sits on blank paper and fails here however it came to
    be emitted.

    The assertion is "ink", not "the rule", deliberately. Telling the rule from
    everything else needs the whole multi-pass trace: at x=2312 on the 41st
    parallel the words "Phil Pico" run directly under the rule and merge with it,
    and a single scan there reads one over-wide run and reports the rule 12 px
    from where it is. A test that reimplemented the discrimination would only be
    asserting the implementation against itself. Blank paper it can judge.
    """
    gray, seeds = _real_raster()
    result = perimeter.build_perimeter(gray, seeds, per_edge=60)

    # Which edge each control point belongs to, from the geography it carries.
    corner_lonlat = {n: (lon, lat) for n, lon, lat in perimeter.UTAH_CORNERS}
    fracs = np.arange(60, dtype=float) / 60
    owner = {}
    for name, (a, b) in EDGES.items():
        lon_a, lat_a = corner_lonlat[a]
        lon_b, lat_b = corner_lonlat[b]
        for k in fracs:
            key = (round(lon_a + k * (lon_b - lon_a), 9),
                   round(lat_a + k * (lat_b - lat_a), 9))
            owner[key] = name

    # The six corner anchors are exempt. A corner is where two rules meet, so a
    # single perpendicular scan crosses both and reads one wide merged run, which
    # the rule-width filter rejects - the scan cannot resolve a corner, and that
    # is why corners are solved by intersecting two fitted arcs instead. Their
    # ink support is the arcs; it is asserted by the corner tests above.
    corners_xy = {(round(x, 6), round(y, 6)) for x, y in result.corners.values()}

    worst = np.inf
    for px, py, lon, lat in result.gcps:
        if (round(px, 6), round(py, 6)) in corners_xy:
            continue
        name = owner[(round(lon, 9), round(lat, 9))]
        a, b = EDGES[name]
        (ax, ay), (bx, by) = result.corners[a], result.corners[b]
        length = np.hypot(bx - ax, by - ay)
        nx, ny = -(by - ay) / length, (bx - ax) / length

        reach = perimeter.MAX_INK_GAP_PX
        offs = np.arange(-30.0, 30.5)
        xs = np.rint(px + offs * nx).astype(int)
        ys = np.rint(py + offs * ny).astype(int)
        assert ((0 <= xs) & (xs < gray.shape[1])).all(), "scan ran off the raster"
        assert ((0 <= ys) & (ys < gray.shape[0])).all(), "scan ran off the raster"
        vals = gray[ys, xs]
        background = float(np.percentile(vals, 80))
        near = np.abs(offs) <= reach
        darkest = float(vals[near].min())
        contrast = background - darkest
        worst = min(worst, contrast)
        assert contrast >= perimeter.MIN_CONTRAST, (
            f"{name} control point ({px:.1f}, {py:.1f}) has no ink within "
            f"{reach:g} px: the darkest pixel there is {darkest:.0f} against a "
            f"local background of {background:.0f}. It sits on blank paper."
        )
    assert worst < 200.0, "no control point was actually measured"


def test_coverage_is_reported_for_every_edge():
    """A thin edge has to be visible in the result, not inferred from a count."""
    gray, seeds = _real_raster()
    result = perimeter.build_perimeter(gray, seeds, per_edge=60)

    assert set(result.coverage) == set(EDGES)
    assert sum(c.n_gcps for c in result.coverage.values()) == len(result.gcps)
    for name, cover in result.coverage.items():
        assert cover.length_px > 100.0, name
        assert cover.n_ink > perimeter.MIN_TRACE_POINTS, name
        # Coverage has to track the points the edge yields, or it is decoration.
        assert cover.n_gcps == pytest.approx(60 * cover.covered, abs=4), name

    # The Wyoming meridian is interrupted for the "27 Bear Lake" and
    # "28 Crawford" labels. That has to show up as measured thinness, and the
    # edge has to yield correspondingly fewer points, or the ink test is not
    # working.
    wyoming = result.coverage["wyoming"]
    assert 0.25 < wyoming.worst_gap < 0.40, (
        f"the Wyoming break measured {wyoming.worst_gap:.0%}; it is 199 px of "
        "612 and should not have moved"
    )
    assert wyoming.n_gcps < 50


def test_a_bridged_gap_would_fail_the_ink_test(monkeypatch):
    """Guard the ink test against being satisfied by a gate that never fires.

    With the run-length criterion off, the letter strokes crossing the Wyoming
    break count as rule ink again and the edge re-admits control points into a
    stretch of map with no boundary on it.
    """
    gray, seeds = _real_raster()
    strict = perimeter.build_perimeter(gray, seeds, per_edge=60)
    monkeypatch.setattr(perimeter, "MIN_RULE_RUN_PX", 0.0)
    loose = perimeter.build_perimeter(gray, seeds, per_edge=60)

    assert loose.coverage["wyoming"].n_gcps > strict.coverage["wyoming"].n_gcps, (
        "dropping the run-length criterion changed nothing; the letter strokes "
        "inside the break are no longer being accepted and this test is inert"
    )


def _straight_path(length=1000.0, holes=()):
    """An anchored path along y=0: two corner anchors and observations between.

    ``holes`` are (start, end) in pixels along the path where no observation is
    made. Observations sit every 1 px, and the trace margin at each end is
    reproduced, so this is the shape ``_anchored_path`` returns.
    """
    xs = np.arange(perimeter.TRACE_MARGIN_PX, length - perimeter.TRACE_MARGIN_PX + 1)
    for lo, hi in holes:
        xs = xs[(xs < lo) | (xs > hi)]
    inner = np.column_stack([xs, np.zeros(len(xs))])
    return np.vstack([[(0.0, 0.0)], inner, [(length, 0.0)]])


def test_inked_spans_reports_one_span_for_an_unbroken_edge():
    spans = perimeter.inked_spans(_straight_path())
    assert spans.shape == (1, 2)
    # Both ends reach the trace margin, so both are joined to their anchor.
    assert spans[0].tolist() == [0.0, 1.0]


def test_inked_spans_splits_at_a_hole_and_not_at_a_scan_dropout():
    """A gap wider than MAX_INK_GAP_PX splits a stretch; a narrower one does not."""
    wide = perimeter.inked_spans(_straight_path(holes=[(400, 600)]))
    assert len(wide) == 2
    assert wide[0][1] * 1000 == pytest.approx(399, abs=2)
    assert wide[1][0] * 1000 == pytest.approx(601, abs=2)

    # Neighbours at 399 and 403: a 4 px dropout, inside MAX_INK_GAP_PX.
    narrow = perimeter.inked_spans(_straight_path(holes=[(400, 402)]))
    assert len(narrow) == 1


def test_inked_spans_does_not_bridge_a_break_that_starts_at_a_corner():
    """The end-extension closes the unscanned margin, never a real break."""
    reach = perimeter.TRACE_MARGIN_PX + 2.0
    short = perimeter.inked_spans(_straight_path(holes=[(0, reach - 2)]))
    assert short[0][0] == 0.0, "the unscanned margin should have been closed"

    real = perimeter.inked_spans(_straight_path(holes=[(0, reach + 20)]))
    assert real[0][0] > 0.0, "a genuine break at the corner was bridged"


def test_rule_ink_discards_a_fragment_and_keeps_a_rule():
    """A letter stroke is not a rule however dark it is."""
    fragment = np.column_stack([np.arange(0.0, perimeter.MIN_RULE_RUN_PX - 5),
                                np.zeros(int(perimeter.MIN_RULE_RUN_PX - 5))])
    rule = np.column_stack([np.arange(200.0, 400.0), np.zeros(200)])
    kept = perimeter._rule_ink(np.vstack([fragment, rule]))
    assert len(kept) == len(rule)
    assert kept[:, 0].min() >= 200.0


def test_edge_coverage_measures_the_hole_it_is_given():
    fracs = np.arange(60, dtype=float) / 60
    cover = perimeter.edge_coverage(_straight_path(holes=[(400, 600)]), fracs)
    assert cover.length_px == pytest.approx(1000.0, abs=1.0)
    assert cover.worst_gap == pytest.approx(0.20, abs=0.01)
    assert cover.covered == pytest.approx(0.80, abs=0.01)
    assert cover.n_gcps == pytest.approx(48, abs=2)


def test_a_control_point_inside_a_hole_is_dropped():
    """The invariant, stated directly: fractions inside a gap yield nothing."""
    path = _straight_path(holes=[(400, 600)])
    fracs = np.array([0.0, 0.3, 0.45, 0.5, 0.55, 0.8])
    keep = perimeter._has_ink_behind(path, fracs)
    assert keep.tolist() == [True, True, False, False, False, True]


def test_an_edge_of_only_lettering_raises():
    """Fragments alone must not add up to a traced edge."""
    holes = [(x, x + 20) for x in range(20, 980, 40)]
    with pytest.raises(ValueError, match="continuously inked"):
        perimeter._anchored_path(
            _straight_path(holes=holes)[1:-1], (0.0, 0.0), (1000.0, 0.0)
        )
