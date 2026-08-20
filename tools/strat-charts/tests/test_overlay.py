"""Tests for the QA overlay and the locality CSV.

Written to fail if the implementation is wrong, not merely to execute it. The
recurring defect in this project has been a test that passes while exercising
nothing, so the drawing tests assert against the matplotlib artists that end up
on the figure rather than against a summary the drawing code returns about
itself. A ``draw`` that returned the right dict while plotting nothing, or a
``render`` that dropped the whole check-point layer, fails here.
"""

import csv
import math
import os

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import pytest  # noqa: E402

from strat_charts import overlay  # noqa: E402
from strat_charts.boundary import UTAH_CORNERS  # noqa: E402


# --------------------------------------------------------------------------
# outline
# --------------------------------------------------------------------------

def test_outline_is_closed():
    ring = overlay.utah_outline()
    assert ring[0] == ring[-1], "ring must close"
    assert len(ring) == 7, "six corners plus the closing point"


def test_outline_keeps_the_boundary_traversal_order():
    """A reordered ring still closes and still has seven points.

    It also draws a bow tie and makes every point-in-polygon answer wrong, so
    closure alone is not a real check.
    """
    ring = overlay.utah_outline()
    assert ring[:-1] == [(lon, lat) for _, lon, lat in UTAH_CORNERS]


def test_outline_is_not_the_bounding_box():
    """The north-east notch is the whole shape of Utah. Losing it is silent."""
    ring = overlay.utah_outline()
    lats_at_colorado = sorted(
        lat for lon, lat in ring if lon == pytest.approx(-109.0506389, abs=1e-5)
    )
    assert lats_at_colorado[-1] == pytest.approx(41.0), (
        "the Colorado meridian must stop at 41 N, not run to 42 N"
    )


# --------------------------------------------------------------------------
# point in polygon
# --------------------------------------------------------------------------

def test_inside_utah_accepts_an_interior_point():
    assert overlay.inside_utah(-111.891, 40.7608)     # Salt Lake City


@pytest.mark.parametrize(
    "lon,lat,where",
    [
        (-116.2, 43.6, "Boise, Idaho"),
        (-108.55, 39.06, "Grand Junction, Colorado"),
        (-112.07, 33.45, "Phoenix, Arizona"),
        (-115.14, 36.17, "Las Vegas, Nevada"),
    ],
)
def test_inside_utah_rejects_points_in_neighbouring_states(lon, lat, where):
    assert not overlay.inside_utah(lon, lat), where


def test_inside_utah_cuts_the_north_east_notch():
    """The notch is the one place a bounding-box test gives the wrong answer.

    Evanston, Wyoming sits north of the 41st parallel and east of the Wyoming
    meridian: inside Utah's bounding box, outside Utah.
    """
    assert not overlay.inside_utah(-110.963, 41.268), "Evanston WY is not in Utah"
    assert overlay.inside_utah(-111.500, 41.268), "same latitude, west of the notch"


# --------------------------------------------------------------------------
# locality CSV
# --------------------------------------------------------------------------

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
    assert float(back[0]["position_uncertainty_m"]) == pytest.approx(18000.0)


def test_uncertainty_is_the_measured_total_not_the_warp_residual():
    """Guard against someone "improving" this to the 60 m georeference figure.

    The pins sit a median 13 km from the places they name because that is where
    the book prints its numbers. Publishing the warp residual would overstate
    precision roughly 300-fold.
    """
    assert overlay.POSITION_UNCERTAINTY_M > 10_000.0


def test_uncertainty_is_the_all_in_check_point_rmse():
    """Pinned to the measured value, both ends.

    18.00 km is the RMSE over all 18 check points. 13.41 km is the same figure
    with the two ambiguously-labelled charts dropped, and quoting that instead
    would be choosing the flattering subset - the exact failure mode the check
    set exists to prevent. A figure far above 18 km would be padding.
    """
    assert overlay.POSITION_UNCERTAINTY_M == pytest.approx(18_000.0, abs=100.0)


def test_write_localities_csv_rejects_a_row_missing_a_field(tmp_path):
    rows = [{"chart_id": 1, "index_label": "Albion", "longitude": -113.6,
             "latitude": 42.4}]          # no source_filename
    with pytest.raises(KeyError):
        overlay.write_localities_csv(rows, str(tmp_path / "x.csv"))


def test_write_localities_csv_rejects_a_blank_text_field(tmp_path):
    """``is None`` alone lets '' through, and '' writes an unattributable pin."""
    rows = [{"chart_id": 1, "index_label": "", "source_filename": "001_Albion.jpg",
             "longitude": -113.6, "latitude": 42.4}]
    with pytest.raises(KeyError):
        overlay.write_localities_csv(rows, str(tmp_path / "x.csv"))


def test_write_localities_csv_rejects_empty():
    """Writing an empty locality set means something upstream failed."""
    with pytest.raises(ValueError, match="no localities"):
        overlay.write_localities_csv([], "unused.csv")


def test_write_localities_csv_rejects_duplicate_chart_ids(tmp_path):
    """123 rows with a repeat is 122 charts and one published twice."""
    rows = [
        {"chart_id": 7, "index_label": "A", "source_filename": "007_A.jpg",
         "longitude": -113.0, "latitude": 41.0},
        {"chart_id": 7, "index_label": "B", "source_filename": "007_B.jpg",
         "longitude": -110.0, "latitude": 38.0},
    ]
    with pytest.raises(ValueError, match="duplicate chart_id"):
        overlay.write_localities_csv(rows, str(tmp_path / "x.csv"))


def test_write_localities_csv_pairs_each_id_with_its_own_coordinates(tmp_path):
    """Order and pairing, not just row count.

    A sort, a zip against a re-derived list, or an off-by-one would leave the
    file the right length with the wrong pins in it - which is precisely the
    defect no downstream consumer can detect.
    """
    rows = [
        {"chart_id": 7, "index_label": "Seven", "source_filename": "007_Seven.jpg",
         "longitude": -113.0, "latitude": 41.0},
        {"chart_id": 3, "index_label": "Three", "source_filename": "003_Three.jpg",
         "longitude": -110.0, "latitude": 38.0},
        {"chart_id": 11, "index_label": "Eleven", "source_filename": "011_Eleven.jpg",
         "longitude": -112.5, "latitude": 39.5},
    ]
    dst = tmp_path / "l.csv"
    overlay.write_localities_csv(rows, str(dst))
    back = list(csv.DictReader(open(dst)))
    assert [r["chart_id"] for r in back] == ["7", "3", "11"]
    for want, got in zip(rows, back):
        assert float(got["longitude"]) == pytest.approx(want["longitude"])
        assert float(got["latitude"]) == pytest.approx(want["latitude"])
        assert got["index_label"] == want["index_label"]


def test_write_localities_csv_rejects_a_non_finite_coordinate(tmp_path):
    """gdaltransform emits inf outside the spline hull; float() accepts it."""
    rows = [{"chart_id": 1, "index_label": "Albion",
             "source_filename": "001_Albion.jpg",
             "longitude": float("inf"), "latitude": 42.4}]
    with pytest.raises(ValueError, match="not a finite"):
        overlay.write_localities_csv(rows, str(tmp_path / "x.csv"))


def test_write_localities_csv_leaves_no_partial_file_when_a_later_row_is_bad(tmp_path):
    """Validate-while-writing leaves a well-formed CSV that is silently short.

    The caller sees the exception; anything that later reads the file sees a
    complete-looking table with rows missing and nothing to indicate it.
    """
    rows = [
        {"chart_id": 1, "index_label": "A", "source_filename": "001_A.jpg",
         "longitude": -113.0, "latitude": 41.0},
        {"chart_id": 2, "index_label": "B", "source_filename": "002_B.jpg",
         "longitude": -112.0, "latitude": 40.0},
        {"chart_id": 3, "index_label": "C", "source_filename": "003_C.jpg",
         "longitude": float("nan"), "latitude": 39.0},
    ]
    dst = tmp_path / "l.csv"
    with pytest.raises(ValueError, match="not a finite"):
        overlay.write_localities_csv(rows, str(dst))
    assert not os.path.exists(dst), "a partial locality table must not be left behind"


def test_write_localities_csv_header_is_the_published_column_order(tmp_path):
    """A literal, not CSV_FIELDS.

    Comparing the header to the constant that produced it passes however the
    constant is reordered, and both README.md and RESIDUALS.md publish this
    order for downstream consumers.
    """
    rows = [{"chart_id": 1, "index_label": "Albion",
             "source_filename": "001_Albion.jpg",
             "longitude": -113.6, "latitude": 42.4}]
    dst = tmp_path / "l.csv"
    overlay.write_localities_csv(rows, str(dst))
    with open(dst, newline="") as fh:
        assert next(csv.reader(fh)) == [
            "chart_id", "index_label", "source_filename", "longitude",
            "latitude", "position_uncertainty_m",
        ]


def test_write_localities_csv_honours_a_per_row_uncertainty(tmp_path):
    """The module constant is a fallback, not an override."""
    rows = [{"chart_id": 1, "index_label": "Albion",
             "source_filename": "001_Albion.jpg",
             "longitude": -113.6, "latitude": 42.4,
             "position_uncertainty_m": 2500.0}]
    dst = tmp_path / "l.csv"
    overlay.write_localities_csv(rows, str(dst))
    back = list(csv.DictReader(open(dst)))
    assert float(back[0]["position_uncertainty_m"]) == pytest.approx(2500.0)


# --------------------------------------------------------------------------
# drawing
# --------------------------------------------------------------------------

LOCALITIES = [
    {"chart_id": 1, "index_label": "Albion", "source_filename": "001_Albion.jpg",
     "longitude": -113.6, "latitude": 42.4},                 # outside: Idaho
    {"chart_id": 34, "index_label": "Salt Lake",
     "source_filename": "034_SaltLake.jpg",
     "longitude": -111.9, "latitude": 40.76},                # inside
]
CHECKS = [{"name": "slc", "lon": -111.891, "lat": 40.7608,
           "pred_lon": -111.88, "pred_lat": 40.75, "error_m": 1200.0}]


def _many_checks(n=18):
    return [
        {"name": f"c{i}", "lon": -113.0 + i * 0.2, "lat": 38.0 + i * 0.1,
         "pred_lon": -113.0 + i * 0.2 + 0.05, "pred_lat": 38.0 + i * 0.1 - 0.03}
        for i in range(n)
    ]


def _collection(ax, label):
    found = [c for c in ax.collections if str(c.get_label()) == label]
    assert len(found) == 1, f"expected one {label!r} collection, got {len(found)}"
    return found[0]


def _pin_offsets(ax):
    """Every point drawn by a pin scatter, in data coordinates."""
    out = []
    for coll in ax.collections:
        if str(coll.get_label()) == overlay.TRUTH_ARTIST_LABEL:
            continue
        out += [tuple(p) for p in coll.get_offsets().tolist()]
    return out


def _segments(ax, label):
    return [
        list(zip(*ln.get_data())) for ln in ax.lines if ln.get_label() == label
    ]


def test_draw_plots_every_locality_at_its_own_coordinate():
    fig, ax = plt.subplots()
    overlay.draw(ax, LOCALITIES, [])
    plotted = _pin_offsets(ax)
    assert len(plotted) == len(LOCALITIES)
    for r in LOCALITIES:
        assert any(
            x == pytest.approx(r["longitude"]) and y == pytest.approx(r["latitude"])
            for x, y in plotted
        ), f"chart {r['chart_id']} was not drawn"
    plt.close(fig)


def test_draw_does_not_transpose_longitude_and_latitude():
    """A (lat, lon) swap draws a plausible-looking scatter in the wrong place."""
    fig, ax = plt.subplots()
    overlay.draw(ax, LOCALITIES, [])
    for x, y in _pin_offsets(ax):
        assert -115.0 < x < -108.0, f"x={x} is not a Utah longitude"
        assert 36.0 < y < 43.0, f"y={y} is not a Utah latitude"
    plt.close(fig)


def test_draw_labels_each_pin_with_its_chart_id():
    fig, ax = plt.subplots()
    overlay.draw(ax, LOCALITIES, [])
    labels = {t.get_text() for t in ax.texts}
    assert {"1", "34"} <= labels
    plt.close(fig)


def test_draw_connects_each_check_point_to_its_own_prediction():
    """The vector must run prediction -> truth, with both ends the right point.

    Drawing truth->truth gives a zero-length line and an empty-looking figure
    that still saves and still passes a file-size assertion.
    """
    fig, ax = plt.subplots()
    overlay.draw(ax, LOCALITIES, CHECKS)
    segs = _segments(ax, overlay.CHECK_VECTOR_LABEL)
    assert len(segs) == 1
    (x0, y0), (x1, y1) = segs[0]
    assert (x0, y0) == pytest.approx((CHECKS[0]["pred_lon"], CHECKS[0]["pred_lat"]))
    assert (x1, y1) == pytest.approx((CHECKS[0]["lon"], CHECKS[0]["lat"]))
    plt.close(fig)


def test_draw_draws_one_vector_per_check_point():
    """Every check point, not the first one.

    Truncating the check set leaves a figure that looks fine and quietly
    withdraws the evidence for RESIDUALS.md section 5 - that the offsets
    scatter in every direction rather than sharing a heading.
    """
    checks = _many_checks(18)
    fig, ax = plt.subplots()
    summary = overlay.draw(ax, LOCALITIES, checks)
    segs = _segments(ax, overlay.CHECK_VECTOR_LABEL)
    assert len(segs) == 18
    assert summary["n_checks"] == 18
    for c, seg in zip(checks, segs):
        (x0, y0), (x1, y1) = seg
        assert (x0, y0) == pytest.approx((c["pred_lon"], c["pred_lat"]))
        assert (x1, y1) == pytest.approx((c["lon"], c["lat"]))
    plt.close(fig)


def test_draw_marks_the_gazetteer_end_of_each_vector():
    """The x markers must sit on the GNIS coordinates, not on the predictions."""
    checks = _many_checks(5)
    fig, ax = plt.subplots()
    overlay.draw(ax, LOCALITIES, checks)
    offsets = _collection(ax, overlay.TRUTH_ARTIST_LABEL).get_offsets().tolist()
    assert len(offsets) == 5
    for c, (x, y) in zip(checks, offsets):
        assert (x, y) == pytest.approx((c["lon"], c["lat"]))
    plt.close(fig)


def test_draw_reports_which_pins_fell_outside_the_state_outline():
    fig, ax = plt.subplots()
    summary = overlay.draw(ax, LOCALITIES, [])
    assert summary["outside"] == [1], "chart 1 plots in Idaho"
    assert summary["n_localities"] == 2
    assert summary["n_checks"] == 0
    plt.close(fig)


def test_draw_returns_outside_ids_in_ascending_order():
    rows = [
        dict(LOCALITIES[0], chart_id=cid, longitude=lon, latitude=lat)
        for cid, lon, lat in [
            (9, -113.6, 42.4),      # Idaho
            (2, -108.5, 39.0),      # Colorado
            (5, -111.9, 40.76),     # inside
            (7, -115.2, 38.0),      # Nevada
        ]
    ]
    fig, ax = plt.subplots()
    assert overlay.draw(ax, rows, [])["outside"] == [2, 7, 9]
    plt.close(fig)


def test_draw_marks_outside_pins_distinctly_from_inside_pins():
    """Secondary encoding, not colour alone.

    An outside pin must differ in marker shape and fill as well as hue, or the
    flag is invisible in greyscale and to a colour-blind reader - which is the
    claim the module's palette comment makes.
    """
    fig, ax = plt.subplots()
    overlay.draw(ax, LOCALITIES, [])
    pins = _collection(ax, overlay.PIN_LABEL)
    flagged = _collection(ax, overlay.OUTSIDE_PIN_LABEL)

    pin_path = pins.get_paths()[0].vertices
    flag_path = flagged.get_paths()[0].vertices
    assert pin_path.shape != flag_path.shape or not (pin_path == flag_path).all(), \
        "outside pins must use a different marker shape"
    faces = flagged.get_facecolors()
    assert len(faces) == 0 or faces[0][3] == 0.0, "outside pins must be unfilled"
    assert flagged.get_sizes()[0] > pins.get_sizes()[0], \
        "outside pins must be larger"
    plt.close(fig)


def test_draw_draws_the_state_outline():
    fig, ax = plt.subplots()
    overlay.draw(ax, LOCALITIES, [])
    segs = _segments(ax, overlay.OUTLINE_LABEL)
    assert len(segs) == 1
    assert segs[0] == [pytest.approx(p) for p in overlay.utah_outline()]
    plt.close(fig)


def test_draw_draws_the_graticule():
    fig, ax = plt.subplots()
    overlay.draw(ax, LOCALITIES, [])
    assert len(_segments(ax, overlay.GRATICULE_ARTIST_LABEL)) == 12
    plt.close(fig)


def test_draw_rejects_a_check_point_with_no_prediction():
    """A check row that lost its prediction must raise, not vanish from the plot."""
    fig, ax = plt.subplots()
    with pytest.raises(KeyError):
        overlay.draw(ax, LOCALITIES, [{"name": "x", "lon": -111.0, "lat": 39.0}])
    plt.close(fig)


@pytest.mark.parametrize("key", ["lon", "lat", "pred_lon", "pred_lat"])
def test_draw_rejects_a_non_finite_check_coordinate(key):
    """An inf from outside the spline hull stretches the axes silently."""
    bad = dict(CHECKS[0], **{key: float("inf")})
    fig, ax = plt.subplots()
    with pytest.raises(ValueError, match="not a finite"):
        overlay.draw(ax, LOCALITIES, [bad])
    plt.close(fig)


@pytest.mark.parametrize("key", ["longitude", "latitude"])
@pytest.mark.parametrize("bad", [float("nan"), float("inf")])
def test_draw_rejects_a_non_finite_locality_coordinate(key, bad):
    """Both axes, both flavours - guarding one and not the other is the bug."""
    fig, ax = plt.subplots()
    with pytest.raises(ValueError, match="not a finite"):
        overlay.draw(ax, [dict(LOCALITIES[0], **{key: bad})], [])
    plt.close(fig)


def test_draw_annotates_each_check_point_with_its_town_name():
    fig, ax = plt.subplots()
    overlay.draw(ax, LOCALITIES, CHECKS)
    named = [t for t in ax.texts if t.get_text() == "slc"]
    assert len(named) == 1
    # At the gazetteer end, where the x is - not at the prediction, which is
    # where the pin already carries its chart number.
    # ``.xy`` is the anchor in data coordinates; ``get_position`` returns the
    # text's pixel offset from it.
    assert named[0].xy == pytest.approx((CHECKS[0]["lon"], CHECKS[0]["lat"]))
    plt.close(fig)


def test_draw_labels_the_axes_the_right_way_round():
    fig, ax = plt.subplots()
    overlay.draw(ax, LOCALITIES, [])
    assert ax.get_xlabel() == "longitude"
    assert ax.get_ylabel() == "latitude"
    plt.close(fig)


def test_draw_uses_a_latitude_corrected_aspect():
    """Plotting lon/lat at aspect 1 squashes Utah by a quarter."""
    fig, ax = plt.subplots()
    overlay.draw(ax, LOCALITIES, [])
    assert ax.get_aspect() == pytest.approx(1.0 / math.cos(math.radians(39.5)), rel=1e-6)
    plt.close(fig)


# --------------------------------------------------------------------------
# legend
# --------------------------------------------------------------------------

def test_legend_lists_each_symbol_once():
    """draw() emits one line artist per check point, all sharing a label.

    Built naively the legend repeats "label offset" 18 times and covers a
    quarter of the map - which is what the first version of this figure did,
    and no assertion on file size noticed.
    """
    fig, ax = plt.subplots()
    overlay.draw(ax, LOCALITIES, _many_checks(18))
    labels = [l for _, l in overlay.legend_entries(ax)]
    assert len(labels) == len(set(labels)), labels
    assert labels.count(overlay.CHECK_VECTOR_LABEL) == 1
    plt.close(fig)


def test_legend_covers_exactly_the_public_symbols():
    fig, ax = plt.subplots()
    overlay.draw(ax, LOCALITIES, CHECKS)
    labels = [l for _, l in overlay.legend_entries(ax)]
    assert set(labels) == {
        overlay.OUTLINE_LABEL, overlay.PIN_LABEL, overlay.OUTSIDE_PIN_LABEL,
        overlay.CHECK_VECTOR_LABEL,
    }
    plt.close(fig)


def test_legend_pairs_each_label_with_its_own_swatch():
    """Right text against the wrong symbol is worse than no legend."""
    fig, ax = plt.subplots()
    overlay.draw(ax, LOCALITIES, CHECKS)
    entries = {l: h for h, l in overlay.legend_entries(ax)}
    assert len({id(h) for h in entries.values()}) == len(entries)
    assert isinstance(entries[overlay.OUTLINE_LABEL], plt.Line2D)
    assert isinstance(entries[overlay.CHECK_VECTOR_LABEL], plt.Line2D)
    assert entries[overlay.PIN_LABEL] is _collection(ax, overlay.PIN_LABEL)
    assert entries[overlay.OUTSIDE_PIN_LABEL] is _collection(
        ax, overlay.OUTSIDE_PIN_LABEL
    )
    plt.close(fig)


# --------------------------------------------------------------------------
# figure assembly
# --------------------------------------------------------------------------

def test_build_figure_keeps_the_whole_check_point_layer():
    """render() consumed checks; nothing asserted they reached the figure.

    Passing [] through to draw() leaves a PNG with no offset vectors and no
    GNIS markers, which still exists and still exceeds any size threshold.
    """
    checks = _many_checks(18)
    fig, ax, summary = overlay.build_figure(LOCALITIES, checks)
    assert summary["n_checks"] == 18
    assert len(_segments(ax, overlay.CHECK_VECTOR_LABEL)) == 18
    assert len(_collection(ax, overlay.TRUTH_ARTIST_LABEL).get_offsets()) == 18
    plt.close(fig)


def test_build_figure_titles_the_plot():
    fig, ax, _ = overlay.build_figure(LOCALITIES, CHECKS)
    assert ax.get_title() == overlay.TITLE
    plt.close(fig)


def test_build_figure_legend_includes_the_gazetteer_marker():
    fig, ax, _ = overlay.build_figure(LOCALITIES, CHECKS)
    texts = [t.get_text() for t in ax.get_legend().get_texts()]
    assert overlay.CHECK_TRUTH_LABEL in texts
    assert overlay.CHECK_VECTOR_LABEL in texts
    assert overlay.OUTSIDE_PIN_LABEL in texts
    assert len(texts) == len(set(texts))
    plt.close(fig)


def test_build_figure_captions_with_the_measured_uncertainty():
    """The 300-fold overstatement must not reach the figure via its caption.

    POSITION_UNCERTAINTY_M is guarded by its own tests; a caption with the
    60 m warp residual hard-coded into it was guarded by nothing.
    """
    fig, _, _ = overlay.build_figure(LOCALITIES, CHECKS)
    caption = " ".join(t.get_text() for t in fig.texts)
    assert f"{overlay.POSITION_UNCERTAINTY_M / 1000:.0f} km" in caption
    assert "18 km" in caption
    assert "2 localities" in caption and "1 check points" in caption
    plt.close(fig)


def test_build_figure_uses_the_callers_caption():
    fig, _, _ = overlay.build_figure(LOCALITIES, CHECKS, caption="bespoke text")
    assert "bespoke text" in " ".join(t.get_text() for t in fig.texts)
    plt.close(fig)


def test_build_figure_rejects_an_empty_locality_set():
    with pytest.raises(ValueError, match="no localities"):
        overlay.build_figure([], [], None)


# --------------------------------------------------------------------------
# render
# --------------------------------------------------------------------------

def test_render_writes_a_figure(tmp_path):
    """render() is ~30 lines of matplotlib and had no test at all."""
    dst = tmp_path / "qa.png"
    assert overlay.render(LOCALITIES, CHECKS, str(dst)) == str(dst)
    assert dst.exists() and dst.stat().st_size > 5000


def test_render_passes_its_arguments_through_to_the_assembly(monkeypatch, tmp_path):
    """The one thing a saved PNG cannot show: what render actually asked for.

    A render that dropped the check points, or ignored the caller's caption,
    produces a file of perfectly respectable size.
    """
    seen = {}
    real = overlay.build_figure

    def spy(localities, checks, caption=None):
        seen.update(localities=localities, checks=checks, caption=caption)
        return real(localities, checks, caption)

    monkeypatch.setattr(overlay, "build_figure", spy)
    overlay.render(LOCALITIES, CHECKS, str(tmp_path / "qa.png"), caption="hello")
    assert seen["localities"] is LOCALITIES
    assert seen["checks"] is CHECKS
    assert seen["caption"] == "hello"


def test_render_works_with_no_check_points(tmp_path):
    """Check points are absent until Task 4 lands; that must not break the figure."""
    localities = [{"chart_id": 1, "index_label": "Albion",
                   "source_filename": "001_Albion.jpg",
                   "longitude": -113.6, "latitude": 42.4}]
    dst = tmp_path / "qa2.png"
    overlay.render(localities, [], str(dst))
    assert dst.exists()


def test_render_rejects_an_empty_locality_set(tmp_path):
    """An empty figure is a green-looking result for a failed pipeline."""
    with pytest.raises(ValueError, match="no localities"):
        overlay.render([], [], str(tmp_path / "qa3.png"))


def test_render_closes_its_figure(tmp_path):
    """123 pins per call; leaking figures across a batch exhausts memory quietly."""
    before = len(plt.get_fignums())
    overlay.render(LOCALITIES, CHECKS, str(tmp_path / "qa4.png"))
    assert len(plt.get_fignums()) == before
