"""QA rendering and locality output.

The overlay is the artifact a human judges. Utah's outline is drawn from the
same control coordinates used to georeference, so a systematically shifted or
sheared warp is immediately visible as pins sitting outside the state.

It is drawn to be *read*, not to be pretty: every pin carries its chart number,
pins outside the state outline are given their own marker as well as their own
colour, and each check point is joined to its gazetteer position by a
true-to-scale line. The check-point offsets are the thing a statistic hides -
a 13 km median could be a warp dragging one half of the state, or it could be
label placement scattering in every direction. Drawn as a vector field the
difference is obvious at a glance and needs no test to interpret.

The figure is assembled by ``build_figure`` and only *written* by ``render``.
A saved PNG can be checked for existence and size, and a plot of nothing
satisfies both - so the assembly is a separate function whose result the tests
can inspect artist by artist.
"""

import csv
import math

import matplotlib
matplotlib.use("Agg")            # no display in this environment
import matplotlib.pyplot as plt  # noqa: E402

from .boundary import UTAH_CORNERS  # noqa: E402

CSV_FIELDS = [
    "chart_id", "index_label", "source_filename", "longitude", "latitude",
    "position_uncertainty_m",
]

# Measured RMSE of 18 index-map labels against USGS GNIS town coordinates.
# This is NOT the georeference residual, which is about 60 m - it is dominated
# by the book's own label placement, since the index map has no locality dot and
# prints each chart's number where it sits legibly inside that chart's region.
# Publishing the 60 m figure would tell a consumer these pins are accurate to a
# city block. They are not, and the difference is 300-fold.
#
# The all-in figure, not the 13.41 km that comes from dropping charts 115
# ("Monticello-Bluff") and 118 ("Vernal NW"). Both are genuine members of the
# population being measured, and selecting the flattering subset is the failure
# mode the check set exists to prevent.
POSITION_UNCERTAINTY_M = 18000.0

TITLE = "Stratigraphic chart localities - QA overlay (ALL-5470)"

# Artist labels. Named constants because the tests locate artists by them, and
# a silently renamed label would turn a real drawing assertion into a no-op.
OUTLINE_LABEL = "Utah (statutory boundary)"
PIN_LABEL = "chart locality"
OUTSIDE_PIN_LABEL = "locality outside the state outline"
CHECK_VECTOR_LABEL = "label offset (pin to gazetteer)"
CHECK_TRUTH_LABEL = "USGS GNIS town"
TRUTH_ARTIST_LABEL = "_nopin_truth"
GRATICULE_ARTIST_LABEL = "_graticule"

# Validated as a categorical set against the visualization skill's palette
# checker (all pairs, light surface): worst CVD dE 10.9, normal-vision 17.7,
# contrast >= 3:1. Outside pins additionally change marker shape and drop their
# fill, so identity never rests on colour alone.
_INK = "#3d3d3d"
_PIN = "#c0392b"
_OUTSIDE = "#b8860b"
_CHECK = "#1f6fb2"

# Utah spans 37-42 N; a degree of longitude there is cos(lat) as long as a
# degree of latitude, so the mid-latitude is the right single correction for a
# plate-carree plot of this small an extent.
_MID_LATITUDE = 39.5

_CHECK_KEYS = ("lon", "lat", "pred_lon", "pred_lat")


def utah_outline() -> list[tuple[float, float]]:
    """Closed boundary ring in (lon, lat)."""
    ring = [(lon, lat) for _, lon, lat in UTAH_CORNERS]
    return ring + [ring[0]]


def inside_utah(lon: float, lat: float) -> bool:
    """Point-in-polygon against the statutory outline, by ray casting.

    Used only to flag pins for the reader, never to correct or drop one. Eleven
    of the 123 charts fall outside and all eleven are legitimate: the index map
    extends past the state line, so charts cover cross-border sections (Grand
    Junction, Grand Canyon, Albion, Preston, Strevell, Snake Range) or sit
    astride a boundary rule (Phil Pico Mountain, Anschutz Ranch, Crawford Mtns,
    Wendover, Curlew Valley). See RESIDUALS.md section 5.

    A bounding-box test would be wrong for the north-east notch, which is a
    third of the state's northern width. Behaviour exactly on an edge is the
    usual half-open ray-casting convention and is deliberately not relied on -
    a pin that lands on a boundary rule to within a float is not a QA signal
    either way, and the nearest real pin to a rule is 0.73 km off it.
    """
    ring = utah_outline()
    inside = False
    for (x0, y0), (x1, y1) in zip(ring, ring[1:]):
        if (y0 > lat) != (y1 > lat):
            # x of the edge at this latitude; y1 != y0 is guaranteed by the
            # straddle test above, so there is no division by zero here.
            xint = x0 + (lat - y0) * (x1 - x0) / (y1 - y0)
            if lon < xint:
                inside = not inside
    return inside


def _require_finite(value: float, what: str) -> float:
    """Reject nan and inf, which ``float()`` accepts and every consumer then hides.

    ``gdaltransform`` emits inf for a point outside the spline's hull, so a
    locality row really can arrive carrying one. Written to CSV it becomes the
    string ``inf``, which most GIS readers turn into a null or a zero without
    complaint, and the pin disappears rather than failing. Plotted, it stretches
    the axes silently and squashes the map into a corner.
    """
    if not math.isfinite(value):
        raise ValueError(f"{what} is {value!r}, which is not a finite number")
    return value


def draw(ax, localities: list[dict], checks: list[dict]) -> dict:
    """Draw the outline, the pins and the check-point offsets onto ``ax``.

    Returns a small summary: how much was drawn, and which chart ids landed
    outside the state outline.
    """
    ring = utah_outline()
    ax.plot(
        [p[0] for p in ring], [p[1] for p in ring],
        "-", lw=1.4, color=_INK, zorder=2, label=OUTLINE_LABEL,
    )

    # Recessive one-degree graticule: gives the eye a frame for judging how far
    # a suspect pin has moved without competing with the data.
    for lon in range(-114, -108):
        ax.plot([lon, lon], [37.0, 42.0], "-", lw=0.4, color="#d8d8d4",
                zorder=0, label=GRATICULE_ARTIST_LABEL)
    for lat in range(37, 43):
        ax.plot([-114.1, -109.0], [lat, lat], "-", lw=0.4, color="#d8d8d4",
                zorder=0, label=GRATICULE_ARTIST_LABEL)

    inside_rows, outside_rows = [], []
    for r in localities:
        lon = _require_finite(float(r["longitude"]), f"chart {r['chart_id']} longitude")
        lat = _require_finite(float(r["latitude"]), f"chart {r['chart_id']} latitude")
        (inside_rows if inside_utah(lon, lat) else outside_rows).append((r, lon, lat))

    if inside_rows:
        ax.scatter(
            [lon for _, lon, _ in inside_rows], [lat for _, _, lat in inside_rows],
            s=16, color=_PIN, marker="o", zorder=4, label=PIN_LABEL,
        )
    if outside_rows:
        # Different marker and no fill as well as a different colour, so the
        # flag survives colour-vision deficiency and greyscale printing.
        ax.scatter(
            [lon for _, lon, _ in outside_rows], [lat for _, _, lat in outside_rows],
            s=54, facecolors="none", edgecolors=_OUTSIDE, linewidths=1.4,
            marker="s", zorder=5, label=OUTSIDE_PIN_LABEL,
        )

    for r, lon, lat in inside_rows + outside_rows:
        ax.annotate(
            str(r["chart_id"]), (lon, lat),
            fontsize=5.5, color=_INK, xytext=(2.5, 2.5),
            textcoords="offset points", zorder=6,
        )

    for c in checks:
        # Explicit rather than .get(): a check row that lost its prediction
        # would otherwise be dropped from the figure with nothing raised, and
        # the overlay would look complete while measuring less than it says.
        missing = [k for k in _CHECK_KEYS if k not in c]
        if missing:
            raise KeyError(f"check point {c.get('name', '?')!r} missing {missing}")
        for key in _CHECK_KEYS:
            _require_finite(float(c[key]), f"check point {c.get('name', '?')!r} {key}")
        ax.plot(
            [c["pred_lon"], c["lon"]], [c["pred_lat"], c["lat"]],
            "-", color=_CHECK, lw=1.1, zorder=7, label=CHECK_VECTOR_LABEL,
        )
        # The town's name at the gazetteer end. Without it a reader can see
        # that the offsets scatter but not that the two longest belong to the
        # two charts whose printed label names somewhere other than the town.
        ax.annotate(
            str(c.get("name", "")), (c["lon"], c["lat"]),
            fontsize=5.5, color=_CHECK, xytext=(4, -7),
            textcoords="offset points", zorder=9,
        )
    if checks:
        ax.scatter(
            [c["lon"] for c in checks], [c["lat"] for c in checks],
            s=30, marker="x", linewidths=1.2, color=_CHECK, zorder=8,
            label=TRUTH_ARTIST_LABEL,
        )

    ax.set_aspect(1.0 / math.cos(math.radians(_MID_LATITUDE)))
    ax.set_xlabel("longitude")
    ax.set_ylabel("latitude")
    for spine in ("top", "right"):
        ax.spines[spine].set_visible(False)
    ax.tick_params(labelsize=8, colors=_INK)

    return {
        "n_localities": len(localities),
        "n_checks": len(checks),
        "outside": sorted(r["chart_id"] for r, _, _ in outside_rows),
    }


def legend_entries(ax):
    """Unique (handle, label) pairs for the artists that carry a public label.

    One entry per symbol. ``draw`` emits one line artist per check point, all
    with the same label, so a legend built straight from
    ``get_legend_handles_labels`` repeats "label offset" once for every check
    point and covers a quarter of the map - which is what the first version of
    this figure did.

    The graticule and the gazetteer markers are excluded by their leading
    underscore, which ``get_legend_handles_labels`` filters for us; there is
    deliberately no second underscore test here, because a branch that can
    never be taken is a branch no test can hold. What that exclusion is worth
    is pinned by ``test_legend_covers_exactly_the_public_symbols`` instead.
    """
    handles, labels = ax.get_legend_handles_labels()
    seen: set[str] = set()
    out = []
    for handle, label in zip(handles, labels):
        if label in seen:
            continue
        seen.add(label)
        out.append((handle, label))
    return out


def default_caption(summary: dict) -> str:
    """The figure's footnote.

    Derived from ``POSITION_UNCERTAINTY_M`` rather than written out, so the
    300-fold overstatement the constant is guarded against cannot reach the
    published figure through its caption instead.
    """
    return (
        f"{summary['n_localities']} localities, {summary['n_checks']} check "
        f"points. Each blue line runs from a chart pin to the USGS GNIS "
        f"coordinate of the town it names;\nits length is the book's label "
        f"offset, not a georeference error. Stated position uncertainty "
        f"{POSITION_UNCERTAINTY_M / 1000:.0f} km."
    )


def build_figure(
    localities: list[dict], checks: list[dict], caption: str | None = None
):
    """Assemble the QA figure. Returns ``(fig, ax, summary)``; writes nothing.

    Separate from ``render`` because a written PNG can only be asserted to
    exist and to exceed some size, and a figure missing its whole check-point
    layer satisfies both.

    Refuses an empty locality set: a blank figure is what a failed pipeline
    looks like when nothing raises.
    """
    if not localities:
        raise ValueError("no localities to render - upstream digitization failed")

    fig, ax = plt.subplots(figsize=(10, 13))
    summary = draw(ax, localities, checks)

    ax.set_title(TITLE, fontsize=12, color=_INK, pad=46)

    keep = legend_entries(ax)
    if checks:
        keep.append(
            (plt.Line2D([], [], marker="x", color=_CHECK, lw=0, markersize=6),
             CHECK_TRUTH_LABEL)
        )
    # Above the axes, in one row: 123 numbered pins leave no empty corner
    # inside the frame, and a legend that covers pins defeats the figure.
    ax.legend(
        [h for h, _ in keep], [l for _, l in keep],
        loc="lower center", bbox_to_anchor=(0.5, 1.005),
        ncol=2 if len(keep) > 3 else len(keep),
        fontsize=8, frameon=False, handlelength=1.8, columnspacing=1.6,
    )

    fig.text(
        0.02, 0.012,
        caption if caption is not None else default_caption(summary),
        fontsize=7.5, color="#666663", va="bottom",
    )
    fig.tight_layout(rect=(0, 0.035, 1, 1))
    return fig, ax, summary


def render(
    localities: list[dict], checks: list[dict], dst_png: str,
    caption: str | None = None,
) -> str:
    """Draw the state outline, the digitized pins, and check-point errors."""
    fig, _, _ = build_figure(localities, checks, caption)
    fig.savefig(dst_png, dpi=200)
    plt.close(fig)
    return dst_png


def _locality_row(row: dict) -> dict:
    """One validated output record, or raise.

    Empty strings are rejected alongside missing keys. A short or partly-built
    row would otherwise write ``,,,-112.0,39.0,18000.0`` - a pin with no chart
    id, no label and no source file, which is not a locality and which nothing
    downstream can attribute.
    """
    out = {k: row.get(k) for k in CSV_FIELDS}
    out["position_uncertainty_m"] = row.get(
        "position_uncertainty_m", POSITION_UNCERTAINTY_M
    )
    missing = [
        k for k, v in out.items()
        if v is None or (isinstance(v, str) and not v.strip())
    ]
    if missing:
        raise KeyError(f"locality {row.get('chart_id')} missing {missing}")
    for field in ("longitude", "latitude", "position_uncertainty_m"):
        _require_finite(float(out[field]), f"locality {out['chart_id']} {field}")
    return out


def write_localities_csv(rows: list[dict], dst: str) -> str:
    """Write the locality table. Refuses to write an empty or partial file.

    Every row is validated *before* the file is opened. Validating while
    writing leaves a well-formed CSV holding the rows that happened to come
    before the bad one: the caller sees the exception, but anything that reads
    the file afterwards sees a short table with nothing visibly wrong with it.
    """
    if not rows:
        raise ValueError("no localities to write - upstream digitization failed")
    out_rows = [_locality_row(r) for r in rows]

    ids = [r["chart_id"] for r in out_rows]
    duplicates = sorted({str(i) for i in ids if ids.count(i) > 1})
    if duplicates:
        raise ValueError(f"duplicate chart_id(s) {duplicates} in the locality table")

    with open(dst, "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=CSV_FIELDS)
        w.writeheader()
        w.writerows(out_rows)
    return dst
