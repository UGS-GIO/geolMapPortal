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

The one invariant everything here serves: **no control point without ink behind
it.** The drawn boundary is interrupted wherever a place name needs the room -
the Wyoming meridian for 199 px of 612 to clear "27 Bear Lake" and "28 Crawford",
the north edge for "Albion", "Strevell" and "Curlew", the south for
"St. George" - and a point placed on one of those blanks is not an observation of
anything. It is a number invented by whatever the model was anchored to, and it
looks exactly like a real one in the output. So a point is emitted only where it
falls inside a continuously inked stretch, and 292 of a possible 360 survive.
Fewer points is the answer, not a shortfall to be recovered by searching wider.
"""

from collections import namedtuple

import numpy as np

from .boundary import UTAH_CORNERS
from .edges import CORNER_EDGES, EDGES

N_TRACE = 900               # samples along each edge
# Skip this many pixels at each end while tracing, so no scan straddles the
# corner where two rules meet and either could answer it. A pixel margin rather
# than a fraction of the edge: as a fraction, 2% of the 2866 px Nevada edge left
# 57 px untraced at each end - wider than the 48 px spacing between control
# points, so the last point on every long edge was dropped for want of a scan
# rather than for want of ink.
TRACE_MARGIN_PX = 10.0
# The drawn rules are strikingly uniform: measured across all six edges their
# width runs 4-8 px, median 6. Lettering that captured the trace at the top of
# the Wyoming edge measured 1-3 px (hairline strokes) or 9-14 px (merged
# glyphs), so width discriminates the rule from the clutter beside it.
MIN_RULE_WIDTH = 3          # px; thinner is a label stroke or a hairline
MAX_RULE_WIDTH = 12         # px; wider is a label, a chart number or a merge
MIN_CONTRAST = 30.0         # grey levels below local background that count as ink
# (scan half-width, model degree) for each refinement pass. The first pass looks
# wider because it starts from the seed chord, which the south rule leaves by
# 41 px; later passes start from a model already on the rule.
TRACE_SCHEDULE = ((60.0, 2), (36.0, 3), (30.0, 5), (30.0, 5))
ACCEPT_TOLERANCE = 4.0      # px a run may sit off the final model and still count
ROBUST_SIGMA = 3.0          # MAD multiples beyond which a scan is an outlier
ROBUST_ROUNDS = 6
END_FIT_POINTS = 60         # traced points used to start each corner solve
CORNER_ARC_POINTS = 250     # traced points, nearest a corner, fitted as its arc
SMOOTH_HALF_WIDTH = 20      # local-linear smoothing half-window, in traced points
MIN_TRACE_POINTS = 120
MIN_ARC_POINTS = 60         # traced points needed to fit an edge's arc
CLIP_SIGMA = 2.5            # reject traced points this far off the fitted arc
CLIP_ROUNDS = 3
NEWTON_ROUNDS = 40
BRACKET_TOLERANCE = 0.10    # a trace may overshoot a corner by this much of the edge
# Longest stretch of an edge that may carry no rule ink. The Wyoming meridian is
# physically broken on the page - the cartographer interrupted the rule to clear
# the "27 Bear Lake" and "28 Crawford" labels - and the break measures 199 px of
# a 612 px edge, 33%. That is a property of the drawing, so the limit has to
# admit it; what it still catches is a trace that has lost its rule and gone off
# down a river or a road, which costs far more than a third of an edge.
MAX_SPAN_GAP = 0.40
# An observation counts as rule ink only if it belongs to a continuously inked
# stretch at least this long. A drawn rule is a line; a letter stroke crossing
# the trace is not, however dark and however rule-shaped its cross-section.
#
# Measured on the real raster the two populations do not overlap: inside the
# Wyoming break the trace accepts four fragments of 0.7, 3.9, 12.5 and 13.8 px
# where "Crawford" and "28" cross x=1815, and the longest fragment anywhere on
# the perimeter is 20.5 px, while the shortest genuine rule stretch is 34.8 px.
# Without this test those four fragments alone re-admitted eleven control points
# into a stretch of the map that carries no boundary at all.
MIN_RULE_RUN_PX = 25.0
# How far apart two observations may be and still count as the same continuous
# stretch of rule. A scan is dropped wherever a label merges with the rule, so an
# unbroken rule still produces the odd dropout; the measured rules are 4-8 px
# wide, median 6, and a step of more than one rule width is a break rather than a
# dropout.
#
# Pixels, not the arc fraction the old point-level limit was expressed in. As a
# fraction, 1% meant 6 px on the 611 px Wyoming edge but 29 px on the 2866 px
# Nevada edge, so the same nominal limit admitted control points half a
# control-point spacing clear of any observation on the long edges - the exact
# failure it was named to prevent. Control points are no longer judged by
# proximity at all: see `_has_ink_behind`.
MAX_INK_GAP_PX = 6.0


def _require_8bit(gray: np.ndarray) -> None:
    finite = gray[np.isfinite(gray)]
    if finite.size == 0:
        raise ValueError("image contains no finite pixel values")
    if float(finite.max()) <= 1.0:
        raise ValueError(
            "image appears 0-1 normalized; this module expects 8-bit 0-255 values"
        )


def _scan_runs(
    gray: np.ndarray,
    cx: float,
    cy: float,
    nx: float,
    ny: float,
    centre: float,
    half_width: float,
) -> list[tuple[float, float]]:
    """Dark runs crossing one perpendicular scan, as (offset, width) pairs.

    The scan is centred on ``centre`` - where the rule is expected - rather than
    on a straight reference, so the window stays over the rule however far the
    rule has curved away.

    The threshold is a fixed contrast below the *local* background, because the
    page shades from about 220 grey at the top to 165 at the bottom and no single
    global level fits both ends. It is deliberately not scaled to the darkest
    pixel in the scan: measured on the real raster, a scan crossing the Glen
    Canyon lettering at x=2100 had its darkest pixel at 71, which dragged a
    proportional threshold down to 130 and hid the south rule sitting at ~135 -
    the one place along that edge where the rule went undetected, and the place
    the trace then wandered off it. Detection must not depend on what else
    happens to be in the scan.

    MIN_CONTRAST is set well under the rules' measured strength: the median ink
    contrast below local background runs 73-111 across the six edges, and 66-93
    at the 5th percentile on the four uncontaminated ones.
    """
    h, w = gray.shape
    offs = np.arange(centre - half_width, centre + half_width + 1.0, dtype=float)
    px = np.rint(cx + offs * nx).astype(int)
    py = np.rint(cy + offs * ny).astype(int)
    ok = (px >= 0) & (px < w) & (py >= 0) & (py < h)
    if int(ok.sum()) < 10:
        return []
    vals = gray[py[ok], px[ok]]
    if not np.isfinite(vals).all():
        return []
    offs = offs[ok]
    thr = float(np.percentile(vals, 80)) - MIN_CONTRAST
    dark = (vals < thr).astype(np.int8)

    flips = np.diff(np.concatenate([[0], dark, [0]]))
    starts = np.flatnonzero(flips == 1)
    ends = np.flatnonzero(flips == -1) - 1

    out = []
    for i, j in zip(starts, ends):
        width = offs[j] - offs[i] + 1.0
        if not (MIN_RULE_WIDTH <= width <= MAX_RULE_WIDTH):
            continue          # not rule-shaped: a label, a number, or a hairline
        weights = thr - vals[i : j + 1]
        out.append((float(np.average(offs[i : j + 1], weights=weights)), float(width)))
    return out


def trace_edge(
    gray: np.ndarray, p0: tuple[float, float], p1: tuple[float, float]
) -> np.ndarray:
    """Recover the drawn rule between two seed points.

    Three approaches were measured on the real raster before this one.

    A darkness-weighted centroid of every dark pixel in a window centred on the
    seed-to-seed chord fails twice over: the south rule departs from its own
    chord by more than 41 px, so the window loses it entirely across the middle
    of the edge, and widening the window only draws in more foreign ink -
    sweeping the half-width from 20 to 80 px raised scan-to-scan roughness on all
    six edges monotonically (south 7.8 -> 12.9 px).

    Following the rule sequentially, keeping the run nearest where the previous
    scans predict it, resolves the rule beautifully where it works (south
    roughness 10.5 -> 1.0 px) but carries state, and state drifts. A single point
    pulled aside by a label stranded the follower past "Bonanza", losing 75% of
    the Colorado edge; widening the gate to recover from that then let the south
    trace jump onto the Glen Canyon lettering. Over 9 seed perturbations x 6
    edges, no setting of the gate and gap limits got past 45 of 54 edges fully
    traced - the failure is sequential state itself, not its tuning.

    So no scan is judged by its neighbours. Every pass re-scans the whole edge
    against a smooth global model of it, takes the run nearest that model at each
    position, and refits the model robustly; outliers are outvoted rather than
    followed. A label can cost a few scans, never the rest of the edge. The first
    pass searches wider, because the chord it starts from is the worst reference
    it will ever have.

    Returns the accepted run centroids - the ink itself, not the model - ordered
    from p0 toward p1. Scans with no acceptable run contribute nothing rather
    than defaulting to the nominal line.
    """
    x0, y0 = float(p0[0]), float(p0[1])
    x1, y1 = float(p1[0]), float(p1[1])
    length = float(np.hypot(x1 - x0, y1 - y0))
    if length < 1.0:
        raise ValueError("edge endpoints coincide")
    ux, uy = (x1 - x0) / length, (y1 - y0) / length
    nx, ny = -uy, ux

    if length < 4.0 * TRACE_MARGIN_PX:
        raise ValueError(
            f"edge is only {length:.1f} px long; the {TRACE_MARGIN_PX:g} px "
            "corner margin would leave too little of it to trace"
        )
    margin = TRACE_MARGIN_PX / length
    ts = np.linspace(margin, 1.0 - margin, N_TRACE)
    cxs = x0 + ts * length * ux
    cys = y0 + ts * length * uy
    # Scan position runs over [-1, 1] rather than [0, N_TRACE) so the fitted
    # polynomial stays well conditioned: a degree-5 Vandermonde built on indices
    # up to 899 spans fifteen orders of magnitude.
    steps = np.linspace(-1.0, 1.0, N_TRACE)
    reference = np.zeros(N_TRACE)
    candidate = np.full(N_TRACE, np.nan)

    for half_width, degree in TRACE_SCHEDULE:
        candidate[:] = np.nan
        for i in range(N_TRACE):
            runs = _scan_runs(
                gray, cxs[i], cys[i], nx, ny, float(reference[i]), half_width
            )
            if runs:
                candidate[i] = min(runs, key=lambda r: abs(r[0] - reference[i]))[0]
        found = np.isfinite(candidate)
        if int(found.sum()) < MIN_TRACE_POINTS:
            raise ValueError(
                f"too few scans found rule-shaped ink ({int(found.sum())} of "
                f"{N_TRACE}, minimum {MIN_TRACE_POINTS}); the seeds do not "
                "bracket a drawn rule"
            )
        model = _robust_polyfit(steps[found], candidate[found], degree)
        reference = model(steps)

    keep = np.isfinite(candidate) & (np.abs(candidate - reference) <= ACCEPT_TOLERANCE)
    n_kept = int(keep.sum())
    if n_kept < MIN_TRACE_POINTS:
        # Returning a short or empty array here would push the failure downstream
        # into a fit with no data, which reports as something else entirely.
        raise ValueError(
            f"only {n_kept} of {N_TRACE} scans found ink within "
            f"{ACCEPT_TOLERANCE:g} px of the fitted rule (minimum "
            f"{MIN_TRACE_POINTS}); the seeds do not bracket a drawn rule"
        )
    offs = candidate[keep]
    return np.column_stack([cxs[keep] + offs * nx, cys[keep] + offs * ny])


def _robust_polyfit(x: np.ndarray, y: np.ndarray, degree: int):
    """Least-squares polynomial with median/MAD outlier rejection.

    Rejection is around the median absolute deviation, not the standard
    deviation. The contaminating features here - a river, a run of lettering -
    occupy contiguous stretches that can reach 40% of an edge, and a standard
    deviation computed with them included is inflated enough that they clip
    nothing.

    Fitted in the Chebyshev basis rather than the power basis. At the degree 5
    the last two passes use, a power-basis design matrix is ill conditioned
    enough for numpy to warn about the rank; the Chebyshev basis on [-1, 1] is
    orthogonal, so the same fit comes out with no conditioning question at all.
    Returns the fitted series, which is callable on the scan positions.
    """
    fit = np.polynomial.Chebyshev.fit
    keep = np.ones(len(x), dtype=bool)
    model = fit(x, y, degree, domain=[-1.0, 1.0])
    for _ in range(ROBUST_ROUNDS):
        residual = y - model(x)
        centre = float(np.median(residual[keep]))
        mad = float(np.median(np.abs(residual[keep] - centre)))
        scale = max(1.4826 * mad, 1.0)
        new_keep = np.abs(residual - centre) < ROBUST_SIGMA * scale
        if int(new_keep.sum()) < MIN_TRACE_POINTS or np.array_equal(new_keep, keep):
            break
        keep = new_keep
        model = fit(x[keep], y[keep], degree, domain=[-1.0, 1.0])
    return model


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


def _principal_frame(pts: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Origin and axes of a trace, with ``along`` pointing from its start to its end.

    The sign SVD returns is arbitrary. Orienting it matters: everything
    downstream reads a trace as ordered from p0 to p1, and a silently reversed
    edge makes the corner solve extrapolate from the far end - worth 5.4 px at
    the Colorado corners before this was pinned down.
    """
    origin = pts.mean(axis=0)
    centred = pts - origin
    _, _, vt = np.linalg.svd(centred, full_matrices=False)
    along = vt[0]
    if float((pts[-1] - pts[0]) @ along) < 0.0:
        along = -along
    return origin, along, np.array([-along[1], along[0]])


def smooth_trace(pts: np.ndarray) -> np.ndarray:
    """Local-linear smoothing of a trace, along its own principal axis.

    Two things have to be separated, and measured on the real raster they are
    well apart. Scan-to-scan noise runs 0.31-0.80 px rms. Departure from a fitted
    quadratic runs 0.49-2.09 px rms and 3.9-6.9 px at worst - larger than the
    noise, smooth at the scale of hundreds of pixels, and therefore real shape:
    page curl and camera perspective on top of the projection. At roughly 198
    m/px even the 2 px figure is 400 m on the ground, so it is not something to
    fit away; it is exactly what the thin-plate spline exists to absorb.

    The noise does have to go, because arc length summed over a noisy polyline is
    inflated and, worse, the inflation is redistributed whenever the samples land
    differently, so a fixed fraction stops naming a fixed place on the drawing.
    A local fit removes the noise and keeps the shape; a global one cannot do
    both. Smoothing moves the traced points 0.27-0.47 px on average - the noise,
    and not much else.
    """
    n = len(pts)
    if n < 2 * SMOOTH_HALF_WIDTH + 3:
        return pts.astype(float, copy=True)
    origin, along, normal = _principal_frame(pts)
    centred = pts - origin
    u = centred @ along
    v = centred @ normal
    order = np.argsort(u)
    u, v = u[order], v[order]

    # Windowed least-squares line through each point, by prefix sums.
    def prefix(a):
        return np.concatenate([[0.0], np.cumsum(a)])

    Pu, Pv, Puu, Puv = prefix(u), prefix(v), prefix(u * u), prefix(u * v)
    idx = np.arange(n)
    lo = np.clip(idx - SMOOTH_HALF_WIDTH, 0, n)
    hi = np.clip(idx + SMOOTH_HALF_WIDTH + 1, 0, n)
    cnt = (hi - lo).astype(float)
    su, sv = Pu[hi] - Pu[lo], Pv[hi] - Pv[lo]
    suu, suv = Puu[hi] - Puu[lo], Puv[hi] - Puv[lo]
    denom = cnt * suu - su * su
    slope = np.where(denom > 1e-9, (cnt * suv - su * sv) / np.where(denom > 1e-9, denom, 1.0), 0.0)
    intercept = (sv - slope * su) / cnt
    v_fit = slope * u + intercept
    return origin + u[:, None] * along + v_fit[:, None] * normal


class _Arc:
    """A traced edge as v = c0 + c1*u + c2*u^2 in its own principal frame.

    Used only near a corner, over CORNER_ARC_POINTS of trace. A straight fit over
    a short window has no leverage against tracing noise - that was the original
    corner refinement's failure, and it still cost up to 1.8 px here. A quadratic
    fit over the whole edge has leverage but is biased, because the real edges
    carry shape a quadratic cannot hold. Local plus quadratic has both: enough
    points to average the noise, and a short enough span that the quadratic is a
    fair description of it.
    """

    __slots__ = ("origin", "along", "normal", "curve", "slope")

    def __init__(self, pts: np.ndarray):
        if len(pts) < MIN_ARC_POINTS:
            raise ValueError(
                f"need at least {MIN_ARC_POINTS} traced points to fit an arc, "
                f"got {len(pts)}"
            )
        self.origin, self.along, self.normal = _principal_frame(pts)
        centred = pts - self.origin
        u = centred @ self.along
        v = centred @ self.normal

        # Fitted with numpy's Polynomial, which maps the sample range onto
        # [-1, 1] before solving. Fitting v against a raw u that spans hundreds
        # of pixels puts four orders of magnitude between the design matrix
        # columns for no reason; the mapped fit is the same curve, conditioned.
        keep = np.ones(len(u), dtype=bool)
        curve = np.polynomial.Polynomial.fit(u, v, 2)
        for _ in range(CLIP_ROUNDS):
            r = v - curve(u)
            sigma = float(r[keep].std())
            if sigma < 1e-9:
                break
            new_keep = np.abs(r) < CLIP_SIGMA * sigma
            if int(new_keep.sum()) < MIN_ARC_POINTS or np.array_equal(new_keep, keep):
                break
            keep = new_keep
            curve = np.polynomial.Polynomial.fit(u[keep], v[keep], 2)
        self.curve = curve
        self.slope = curve.deriv()

    def point(self, u: float) -> np.ndarray:
        return self.origin + u * self.along + float(self.curve(u)) * self.normal

    def tangent(self, u: float) -> np.ndarray:
        return self.along + float(self.slope(u)) * self.normal

    def parameter_of(self, xy) -> float:
        return float((np.asarray(xy, dtype=float) - self.origin) @ self.along)


def _intersect_arcs(
    arc_a: _Arc, arc_b: _Arc, guess: tuple[float, float]
) -> tuple[float, float]:
    """Newton solve for the point where two fitted arcs meet.

    ``guess`` only selects which intersection branch to walk to; the converged
    answer is a property of the two arcs, not of the starting point.
    """
    ua = arc_a.parameter_of(guess)
    ub = arc_b.parameter_of(guess)
    for _ in range(NEWTON_ROUNDS):
        pa, pb = arc_a.point(ua), arc_b.point(ub)
        residual = pa - pb
        if float(np.hypot(*residual)) < 1e-9:
            return float(pa[0]), float(pa[1])
        jac = np.column_stack([arc_a.tangent(ua), -arc_b.tangent(ub)])
        if abs(float(np.linalg.det(jac))) < 1e-9:
            raise ValueError("fitted arcs meet at too shallow an angle")
        step = np.linalg.solve(jac, -residual)
        ua += float(step[0])
        ub += float(step[1])
    raise ValueError(
        f"corner solve did not converge in {NEWTON_ROUNDS} rounds "
        f"(residual {float(np.hypot(*(arc_a.point(ua) - arc_b.point(ub)))):.3g} px)"
    )


def corners_from_traces(
    traces: dict[str, np.ndarray]
) -> dict[str, tuple[float, float]]:
    """Locate every boundary corner where the two edges meeting there intersect.

    Each edge contributes only the CORNER_ARC_POINTS of trace nearest the corner,
    fitted as an arc and extrapolated the short distance to it. Straight
    end-tangents (``corner_pixel``) start the solve; the arcs finish it.
    """
    corners = {}
    for corner, (edge_in, edge_out) in CORNER_EDGES.items():
        if edge_in not in traces or edge_out not in traces:
            raise KeyError(f"corner {corner!r} needs traces {edge_in!r}, {edge_out!r}")
        tail = traces[edge_in][-CORNER_ARC_POINTS:]
        head = traces[edge_out][:CORNER_ARC_POINTS]
        start = corner_pixel(
            traces[edge_in][-END_FIT_POINTS:], traces[edge_out][:END_FIT_POINTS]
        )
        try:
            corners[corner] = _intersect_arcs(_Arc(tail), _Arc(head), start)
        except ValueError as exc:
            raise ValueError(f"corner {corner!r}: {exc}") from exc
    return corners


def _anchored_path(
    P: np.ndarray, a_xy: tuple[float, float], b_xy: tuple[float, float]
) -> np.ndarray:
    """Clip a smoothed trace to its corner span and pin both ends to the corners.

    ``trace_edge`` starts and stops a fixed margin in from its endpoints, so its
    raw extent moves bodily whenever an endpoint moves - which would make both
    the emitted pixel and the arc-length fraction that carries its geography
    follow the seeds. Re-anchoring on corners recovered from the ink removes
    that: the span becomes a property of the drawing.

    Points outside the span are dropped rather than folded in; a trace that
    overshoots a corner has left its own rule and is looking at the next one.
    """
    ax, ay = float(a_xy[0]), float(a_xy[1])
    bx, by = float(b_xy[0]), float(b_xy[1])
    dx, dy = bx - ax, by - ay
    span2 = dx * dx + dy * dy
    if span2 <= 1.0:
        raise ValueError("corner pixels coincide; cannot anchor the edge")
    s = ((P[:, 0] - ax) * dx + (P[:, 1] - ay) * dy) / span2
    keep = (s > 0.0) & (s < 1.0)
    if int(keep.sum()) < MIN_TRACE_POINTS:
        raise ValueError(
            f"only {int(keep.sum())} traced points fall between the corners "
            f"(< {MIN_TRACE_POINTS}); the trace is not on this edge"
        )
    if float(s.min()) < -BRACKET_TOLERANCE or float(s.max()) > 1.0 + BRACKET_TOLERANCE:
        raise ValueError(
            "traced points run past the corners by more than "
            f"{BRACKET_TOLERANCE:.0%} of the edge; the trace has left this rule"
        )

    order = np.argsort(s[keep])
    inner = _rule_ink(P[keep][order])
    if len(inner) < MIN_TRACE_POINTS:
        raise ValueError(
            f"only {len(inner)} of the traced points lie in a continuously "
            f"inked stretch at least {MIN_RULE_RUN_PX:g} px long "
            f"(< {MIN_TRACE_POINTS}); this is lettering, not a rule"
        )
    return np.vstack([[(ax, ay)], inner, [(bx, by)]])


def _rule_ink(obs: np.ndarray) -> np.ndarray:
    """Keep only observations that belong to a long enough continuous stretch.

    Consecutive observations further apart than MAX_INK_GAP_PX start a new
    stretch; a stretch shorter than MIN_RULE_RUN_PX end to end is discarded as
    lettering rather than rule. Discarding rather than merely refusing to emit a
    control point beside it matters, because the fragment would otherwise still
    pull the interpolated polyline off the rule either side of itself.
    """
    if len(obs) < 2:
        return obs
    seg = np.hypot(np.diff(obs[:, 0]), np.diff(obs[:, 1]))
    breaks = np.flatnonzero(seg > MAX_INK_GAP_PX)
    starts = np.concatenate([[0], breaks + 1])
    ends = np.concatenate([breaks, [len(obs) - 1]])
    keep = np.zeros(len(obs), dtype=bool)
    for i, j in zip(starts, ends):
        if float(np.hypot(*(obs[j] - obs[i]))) >= MIN_RULE_RUN_PX:
            keep[i : j + 1] = True
    return obs[keep]


def _sample_by_fraction(path: np.ndarray, fracs: np.ndarray) -> np.ndarray:
    """Interpolate along a polyline at given fractions of its arc length."""
    f = _arc_fractions(path)
    return np.column_stack(
        [np.interp(fracs, f, path[:, 0]), np.interp(fracs, f, path[:, 1])]
    )


EdgeCoverage = namedtuple("EdgeCoverage", "length_px n_ink covered worst_gap n_gcps")


def inked_spans(path: np.ndarray) -> np.ndarray:
    """The stretches of an anchored edge that carry drawn rule, in arc fraction.

    Returned as an ``(n, 2)`` array of (start, end) pairs. Consecutive
    observations further apart than MAX_INK_GAP_PX begin a new stretch; the
    corner anchors at either end of ``path`` are not observations and do not
    extend one.
    """
    f = _arc_fractions(path)[1:-1]
    if len(f) < 2:
        return np.empty((0, 2))
    length = _path_length(path)
    step = MAX_INK_GAP_PX / length
    breaks = np.flatnonzero(np.diff(f) > step)
    starts = np.concatenate([[0], breaks + 1])
    ends = np.concatenate([breaks, [len(f) - 1]])
    spans = np.column_stack([f[starts], f[ends]])

    # A corner anchor is ink evidence too - it is solved by intersecting the arcs
    # fitted to the two edges meeting there. So a stretch that reaches within
    # scanning distance of an anchor is joined to it, closing the strip
    # TRACE_MARGIN_PX wide that the trace deliberately does not scan lest a scan
    # straddle the corner. Bounded and bracketed by ink at both ends: over such a
    # strip the arc departs from its chord by well under a pixel.
    #
    # The slack over TRACE_MARGIN_PX is deliberately small. Measured on the real
    # raster the twelve edge ends fall in two groups with nothing in between: the
    # eight that are inked to the margin sit at 9.95-10.46 px from their anchor,
    # and the three genuine breaks at a corner sit at 19.6 px (nevada at sw),
    # 48.6 (south at sw) and 57.5 (forty_first at notch_inner). 2 px of slack
    # covers the first group with room to spare and leaves 7 px of daylight
    # before the nearest real break; MAX_INK_GAP_PX would have eaten most of it
    # while closing nothing that is not closed already.
    reach = (TRACE_MARGIN_PX + 2.0) / length
    if spans[0, 0] <= reach:
        spans[0, 0] = 0.0
    if spans[-1, 1] >= 1.0 - reach:
        spans[-1, 1] = 1.0
    return spans


def _path_length(path: np.ndarray) -> float:
    length = float(np.hypot(np.diff(path[:, 0]), np.diff(path[:, 1])).sum())
    if length <= 0.0:
        raise ValueError("anchored edge has zero length")
    return length


def edge_coverage(path: np.ndarray, fracs: np.ndarray) -> EdgeCoverage:
    """How much of an anchored edge actually carries drawn rule.

    Where the rule is missing, the polyline cuts a straight chord and anything
    placed along it sits off the rule with its arc-length fraction mismeasured to
    match. That is invisible in the output, so the size of it has to be carried
    out of here and reported rather than left for a reader to infer from a count.

    ``covered`` is the fraction of the edge lying inside an inked stretch;
    ``worst_gap`` is the longest run between stretches, which is what the
    MAX_SPAN_GAP policy is judged against; ``n_gcps`` is how many of ``fracs``
    survive the ink test.
    """
    length = _path_length(path)
    spans = inked_spans(path)
    if len(spans) == 0:
        raise ValueError("no inked stretch on this edge")
    edges = np.concatenate([[0.0], spans.reshape(-1), [1.0]])
    return EdgeCoverage(
        length_px=length,
        n_ink=len(path) - 2,
        covered=float((spans[:, 1] - spans[:, 0]).sum()),
        worst_gap=float(np.diff(edges)[::2].max()),
        n_gcps=int(_has_ink_behind(path, fracs).sum()),
    )


def _trace_all(
    gray: np.ndarray, ends: dict[str, tuple[float, float]]
) -> tuple[dict[str, np.ndarray], dict[str, tuple[float, float]]]:
    """Trace the six rules between the given endpoints and solve the corners."""
    smoothed = {}
    for name, (a, b) in EDGES.items():
        try:
            smoothed[name] = smooth_trace(trace_edge(gray, ends[a], ends[b]))
        except ValueError as exc:
            raise ValueError(f"edge {name!r}: {exc}") from exc
    return smoothed, corners_from_traces(smoothed)


def _has_ink_behind(path: np.ndarray, fracs: np.ndarray) -> np.ndarray:
    """Which sample fractions sit on drawn rule rather than on blank paper.

    A sample must fall *inside* an inked stretch, not merely near the end of one.
    Being near was tried first and is not enough: on the north edge it emitted a
    control point 4.7 px past where the rule stops for the label "Albion", where
    a fresh perpendicular scan of the raster finds no rule-shaped ink at all.
    Inside a stretch the nearest observation is at most half a scan step away by
    construction, so no separate distance tolerance is needed.

    Fraction 0 is always supported. It is the corner anchor, which is not sampled
    off the polyline at all but solved by intersecting the arcs fitted to the two
    edges meeting there - ink-derived, and the one point on the edge a single
    perpendicular scan could not have resolved.
    """
    inside = np.zeros(len(fracs), dtype=bool)
    for lo, hi in inked_spans(path):
        inside |= (fracs >= lo) & (fracs <= hi)
    return inside | (fracs == 0.0)


PerimeterResult = namedtuple("PerimeterResult", "gcps coverage corners")


def build_perimeter(
    gray: np.ndarray, seeds: dict, per_edge: int = 60
) -> PerimeterResult:
    """Trace all six edges and emit (px, py, lon, lat) control points.

    Trace each rule, using the seeds only to say where to look; smooth each trace
    locally to take out scan noise while keeping its shape; recover the six
    corners where the arcs of adjacent edges intersect; re-trace from those
    corners; then walk each corner-anchored path and place up to ``per_edge``
    points at equal fractions of its arc length, giving each the geography that
    fraction implies.

    The re-trace is what makes the seeds inert, and it is not optional. A trace
    lays its scans along the line between its endpoints, so with seed endpoints
    the scan positions - and with them which marginal scans happen to catch ink -
    shift bodily with the seeds. Measured over ten constant seed offsets of up to
    +-10 px, tracing once from the seeds moved the emitted control points by up to
    2.90 px and the corners by 1.88 px; tracing a second time between corners
    recovered from the ink brings those to 0.54 px and 0.49 px.

    Every fraction is taken in ``[0, 1)`` so each corner is emitted exactly once,
    as the start of the edge that leaves it, and the six edges tile the perimeter
    without repeating a pixel.

    An edge yields *fewer* than ``per_edge`` points where the rule is interrupted:
    a control point that does not fall inside an inked stretch is dropped rather
    than interpolated across the gap. Fewer points there is the correct
    answer, not a shortfall to be recovered by searching wider or thresholding
    lower. The interruptions are deliberate cartography - the rule is broken to
    clear "27 Bear Lake" and "28 Crawford" on the Wyoming meridian, "Albion",
    "Strevell" and "Curlew" on the north edge, "St. George" on the south - and no
    setting finds ink that was never drawn. On the real raster this is 292 points
    of a possible 360, and the sparsest edges are still braced by the ones that
    meet them.

    Raises rather than returning a quietly degraded perimeter: too few traced
    points, a trace that has wandered onto the neighbouring rule, or an edge whose
    ink leaves a stretch wider than MAX_SPAN_GAP unsupported all stop the build,
    naming the edge and its measured coverage. Coverage for every edge is
    returned alongside the points either way, so a thin edge is visible without
    having to infer it from a count.
    """
    if per_edge < 2:
        raise ValueError(f"per_edge must be at least 2, got {per_edge}")
    _require_8bit(gray)
    lookup = {name: (lon, lat) for name, lon, lat in UTAH_CORNERS}
    for name, (a, b) in EDGES.items():
        if a not in seeds or b not in seeds:
            raise KeyError(f"edge {name!r} needs seeds {a!r} and {b!r}")

    _, corners = _trace_all(gray, {k: tuple(v) for k, v in seeds.items()})
    smoothed, corners = _trace_all(gray, corners)
    fracs = np.arange(per_edge, dtype=float) / per_edge

    gcps: list[tuple[float, float, float, float]] = []
    coverage: dict[str, EdgeCoverage] = {}
    for name, (a, b) in EDGES.items():
        try:
            path = _anchored_path(smoothed[name], corners[a], corners[b])
            cover = edge_coverage(path, fracs)
            if cover.worst_gap > MAX_SPAN_GAP:
                raise ValueError(
                    f"ink covers {cover.covered:.1%} of the edge and leaves "
                    f"{cover.worst_gap:.1%} unsupported in one stretch (limit "
                    f"{MAX_SPAN_GAP:.0%}); control points there would sit on a "
                    "chord rather than on the rule"
                )
            xy = _sample_by_fraction(path, fracs)
        except ValueError as exc:
            raise ValueError(f"edge {name!r}: {exc}") from exc

        keep = _has_ink_behind(path, fracs)
        coverage[name] = cover

        lon_a, lat_a = lookup[a]
        lon_b, lat_b = lookup[b]
        for k, (x, y), ok in zip(fracs, xy, keep):
            if not ok:
                continue
            gcps.append(
                (
                    float(x),
                    float(y),
                    lon_a + k * (lon_b - lon_a),
                    lat_a + k * (lat_b - lat_a),
                )
            )

    seen: set[tuple[float, float]] = set()
    for g in gcps:
        key = (round(g[0], 3), round(g[1], 3))
        if key in seen:
            raise ValueError(
                f"duplicate control pixel at {key}; a repeated point makes the "
                "thin-plate spline singular"
            )
        seen.add(key)
    return PerimeterResult(gcps=gcps, coverage=coverage, corners=corners)


def build_perimeter_gcps(
    gray: np.ndarray, seeds: dict, per_edge: int = 60
) -> list[tuple[float, float, float, float]]:
    """The (px, py, lon, lat) control points of ``build_perimeter``.

    Call ``build_perimeter`` directly for the per-edge ink coverage behind them.
    """
    return build_perimeter(gray, seeds, per_edge).gcps
