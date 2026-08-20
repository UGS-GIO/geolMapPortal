"""Measure how good the georeference actually is.

Two independent estimates, because neither alone is honest: leave-one-out
cross-validation is rigorous but only samples the boundary, and interior check
points measure real pin accuracy but depend on an external gazetteer.

Both take pixels measured on the SOURCE raster, so both go through
``georef.source_pixel_to_lonlat`` and the GCP-tagged intermediate. Not
``pixel_to_lonlat``: that reads the warped output's own affine grid, which is a
different pixel space (3626x3653 against the source's 3024x4032). The two agree
on nothing and disagree silently - measured at 27-124 km on identical input -
so an accuracy module that reached for the wrong one would report the mismatch
as error and condemn a working georeference.
"""

import csv
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


def _require_finite(value: float, what: str) -> float:
    """Reject nan and inf, which ``float()`` accepts and every statistic then hides.

    A single nan sorts unpredictably, so ``summarise`` would return a plausible
    min and max computed from a corrupted order alongside a nan median - wrong
    numbers that look like right ones, with nothing raised. ``gdaltransform``
    can emit inf for a point outside the spline's hull, so this is a live path
    and not only a malformed-CSV guard.
    """
    if not math.isfinite(value):
        raise ValueError(f"{what} is {value!r}, which is not a finite number")
    return value


def gcps_from_perimeter(points, prefix: str = "p") -> list[georef.Gcp]:
    """Name the ``(px, py, lon, lat)`` tuples ``perimeter`` emits so they can be warped.

    ``perimeter.build_perimeter_gcps`` returns bare tuples; ``georef.warp`` and
    ``loo_residuals`` need ``Gcp`` records with a name. Without this the
    documented cross-validation has no runnable path from the perimeter to the
    measurement, which is the one thing provenance tooling has to guarantee.

    Names are generated here rather than taken from the caller because
    ``loo_residuals`` builds a filename from each one; a name carrying a path
    separator would write outside the work directory.
    """
    out = []
    for i, point in enumerate(points):
        if len(point) != 4:
            raise ValueError(
                f"perimeter point {i} has {len(point)} values, expected "
                "(px, py, lon, lat)"
            )
        px, py, lon, lat = (
            _require_finite(float(v), f"perimeter point {i}") for v in point
        )
        out.append(georef.Gcp(f"{prefix}{i:03d}", px, py, lon, lat))
    if not out:
        raise ValueError("no perimeter control points")
    return out


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
        # held.px/py are SOURCE-image pixels, so they must go through the TPS
        # built from the remaining GCPs - not through the warped output's own
        # affine grid, which would report 27-124 km of pure coordinate-system
        # mismatch as though it were accuracy.
        (pred_lon, pred_lat), = georef.source_pixel_to_lonlat(
            georef.gcp_tagged_path(tif), [(held.px, held.py)]
        )
        out.append((held.name, haversine_m(pred_lon, pred_lat, held.lon, held.lat)))
    return out


def check_point_residuals(gcp_tif: str, checks: list[dict]) -> list[dict]:
    """Error at independent check points whose true coordinates are known.

    ``gcp_tif`` is the GCP-tagged intermediate; ``px``/``py`` are measured on
    the source image.
    """
    preds = georef.source_pixel_to_lonlat(
        gcp_tif, [(c["px"], c["py"]) for c in checks]
    )
    if len(preds) != len(checks):
        raise RuntimeError(
            f"transform returned {len(preds)} results for {len(checks)} check points"
        )
    rows = []
    for c, (plon, plat) in zip(checks, preds):
        name = c.get("name", "?")
        _require_finite(plon, f"{name}: predicted longitude")
        _require_finite(plat, f"{name}: predicted latitude")
        rows.append(
            {
                **c,
                "pred_lon": plon,
                "pred_lat": plat,
                "error_m": haversine_m(plon, plat, c["lon"], c["lat"]),
            }
        )
    return rows


def source_pixel_of(
    gcp_tif: str, lonlats: list[tuple[float, float]]
) -> list[tuple[float, float]]:
    """Inverse of ``georef.source_pixel_to_lonlat``: geography back to source pixels.

    Needed to separate *bias* from *scatter* in the check-point residuals. A
    distance in metres says how far a pin is out but not which way, and
    direction is the whole question: a systematic warp shows up as a mean
    offset, while randomly placed labels average to zero. Comparing in pixels
    also avoids attributing a pixel-space magnitude a single metres-per-pixel
    scale, which this conic-drawn map does not have.
    """
    return georef._gdaltransform(
        ["gdaltransform", "-i", "-output_xy", "-tps", gcp_tif], lonlats
    )


def check_point_offsets(gcp_tif: str, checks: list[dict]) -> list[dict]:
    """``check_point_residuals`` plus the source-pixel offset of each glyph.

    ``dx``/``dy`` are the digitized glyph pixel minus the pixel the georeference
    predicts for the gazetteer coordinate: where the cartographer put the label
    relative to where the locality actually maps.
    """
    rows = check_point_residuals(gcp_tif, checks)
    preds = source_pixel_of(gcp_tif, [(c["lon"], c["lat"]) for c in checks])
    if len(preds) != len(rows):
        raise RuntimeError(
            f"inverse transform returned {len(preds)} results for {len(rows)} "
            "check points"
        )
    for row, (tx, ty) in zip(rows, preds):
        name = row.get("name", "?")
        _require_finite(tx, f"{name}: predicted px")
        _require_finite(ty, f"{name}: predicted py")
        row["pred_px"] = tx
        row["pred_py"] = ty
        row["dx"] = row["px"] - tx
        row["dy"] = row["py"] - ty
    return rows


def offset_bias(rows: list[dict]) -> dict:
    """Is the check-point offset a systematic warp, or scatter about zero?

    Returns the mean offset and its standard error - a bound on any bias the
    check points could detect - alongside the rms magnitude and the correlation
    of each offset component with position. A warp gives a large mean or
    position-correlated offsets; random label placement gives neither.

    Needs at least three points, below which the standard error is not defined
    in a way worth reporting.
    """
    n = len(rows)
    if n < 3:
        raise ValueError(f"need at least 3 check points for a bias estimate, got {n}")
    dx = [_require_finite(r["dx"], "dx") for r in rows]
    dy = [_require_finite(r["dy"], "dy") for r in rows]
    px = [_require_finite(r["px"], "px") for r in rows]
    py = [_require_finite(r["py"], "py") for r in rows]

    def mean(v):
        return sum(v) / len(v)

    def stdev(v):
        m = mean(v)
        return math.sqrt(sum((x - m) ** 2 for x in v) / (len(v) - 1))

    def corr(a, b):
        """Pearson correlation, or None where it is undefined.

        A constant series has zero variance and no correlation is defined
        against it - which happens for a pure shift with no scatter, a real
        input this function has to survive. None rather than 0.0: zero is the
        value that means "measured, and no warp", and the two must not be
        confused at the call site.
        """
        ma, mb = mean(a), mean(b)
        num = sum((x - ma) * (y - mb) for x, y in zip(a, b))
        da = math.sqrt(sum((x - ma) ** 2 for x in a))
        db = math.sqrt(sum((y - mb) ** 2 for y in b))
        if da == 0.0 or db == 0.0:
            return None
        return num / (da * db)

    return {
        "n": n,
        "mean_dx": mean(dx),
        "mean_dy": mean(dy),
        "se_dx": stdev(dx) / math.sqrt(n),
        "se_dy": stdev(dy) / math.sqrt(n),
        "rms_offset": math.sqrt(sum(x * x + y * y for x, y in zip(dx, dy)) / n),
        "corr_dx_px": corr(dx, px),
        "corr_dx_py": corr(dx, py),
        "corr_dy_px": corr(dy, px),
        "corr_dy_py": corr(dy, py),
    }


CHECK_POINT_FIELDS = ("name", "chart_id", "px", "py", "lon", "lat", "source", "retrieved")


def load_check_points(path: str) -> list[dict]:
    """Read ``data/check_points.csv`` into the shape ``check_point_residuals`` takes.

    A blank or unparseable px/py/lon/lat is an error, not a row to skip: a check
    point that quietly drops out shrinks the sample that the accuracy claim rests
    on without changing the number that gets reported.
    """
    rows = []
    with open(path, newline="", encoding="utf-8") as fh:
        # Leading '#' lines carry the gazetteer citation, which belongs beside
        # the coordinates it produced rather than only in a README.
        reader = csv.DictReader(ln for ln in fh if not ln.startswith("#"))
        missing = [f for f in CHECK_POINT_FIELDS if f not in (reader.fieldnames or [])]
        if missing:
            raise ValueError(f"{path}: missing column(s) {missing}")
        for rowno, raw in enumerate(reader, start=1):
            where = f"{path} row {rowno} {raw.get('name') or '<unnamed>'}"
            row = {}
            # Text fields are required non-empty too. A short row gives
            # DictReader's restval of None, so reading them raw would put a
            # null citation in a table whose entire purpose is provenance.
            for field in ("name", "chart_id", "source", "retrieved"):
                value = (raw[field] or "").strip()
                if not value:
                    raise ValueError(f"{where}: {field} is blank")
                row[field] = value
            for field in ("px", "py", "lon", "lat"):
                value = (raw[field] or "").strip()
                if not value:
                    raise ValueError(f"{where}: {field} is blank")
                try:
                    row[field] = float(value)
                except ValueError as exc:
                    raise ValueError(
                        f"{where}: {field}={value!r} is not a number"
                    ) from exc
                _require_finite(row[field], f"{where}: {field}")
            if None in raw:
                raise ValueError(
                    f"{where}: {len(raw[None])} extra column(s) beyond the header"
                )
            rows.append(row)
    if not rows:
        raise ValueError(f"{path}: no check points")
    names = [r["name"] for r in rows]
    duplicates = sorted({n for n in names if names.count(n) > 1})
    if duplicates:
        raise ValueError(f"{path}: duplicate check point name(s) {duplicates}")
    return rows


def summarise(errors: list[float]) -> dict:
    """min / median / max / RMSE over a list of errors, in the input's units."""
    if not errors:
        raise ValueError("no errors to summarise")
    for i, e in enumerate(errors):
        # Before sorting: a nan sorts unpredictably, so min and max would come
        # out of a corrupted order looking entirely plausible.
        _require_finite(e, f"error {i}")
    ordered = sorted(errors)
    n = len(ordered)
    mid = n // 2
    median = ordered[mid] if n % 2 else 0.5 * (ordered[mid - 1] + ordered[mid])
    return {
        "n": n,
        "min": ordered[0],
        "median": median,
        "max": ordered[-1],
        "rmse": math.sqrt(sum(e * e for e in errors) / n),
    }
