import csv
import json
import math
import re
from pathlib import Path

import pytest
from strat_charts import digitize

DATA = Path(__file__).resolve().parents[1] / "data"
OUT = Path(__file__).resolve().parents[1] / "out"
GCP_TIF = OUT / "index_map_gcp.tif"

needs_raster = pytest.mark.skipif(
    not GCP_TIF.exists(), reason=f"requires the georeferenced raster {GCP_TIF}"
)


def _rows(names, anchors):
    return digitize.anchors_to_localities(anchors, str(GCP_TIF), names)


def _km(lon_a, lat_a, lon_b, lat_b):
    dx = (lon_a - lon_b) * 111.0 * math.cos(math.radians(lat_a))
    dy = (lat_a - lat_b) * 111.0
    return math.hypot(dx, dy)


def _read_csv(path):
    with open(path, newline="") as fh:
        return list(csv.DictReader(line for line in fh if not line.startswith("#")))


# --- chart_names.csv ---------------------------------------------------------


def test_chart_names_has_123_entries():
    names = digitize.load_chart_names(str(DATA / "chart_names.csv"))
    assert len(names) == 123
    assert set(names) == set(range(1, 124)), "chart ids must be 1..123 with no gaps"


def test_chart_names_excludes_duplicate_variants():
    """No ' 2' / ' 3' revision variants, and no other trailing-digit variant."""
    names = digitize.load_chart_names(str(DATA / "chart_names.csv"))
    for fn in names.values():
        assert re.search(r" \d+\.jpg$", fn, re.IGNORECASE) is None, fn


def test_chart_names_filenames_carry_their_own_id():
    """The NNN_ prefix must agree with the chart_id column."""
    names = digitize.load_chart_names(str(DATA / "chart_names.csv"))
    for chart_id, fn in names.items():
        assert fn.startswith(f"{chart_id:03d}_"), f"{chart_id} -> {fn}"


def test_chart_70_is_the_plate():
    names = digitize.load_chart_names(str(DATA / "chart_names.csv"))
    assert "Uinta Basin Maps" in names[70]


def test_load_chart_names_rejects_a_duplicate_id(tmp_path):
    p = tmp_path / "dupe.csv"
    p.write_text("chart_id,source_filename\n1,001_A.jpg\n1,001_B.jpg\n")
    with pytest.raises(ValueError, match="duplicate chart_id"):
        digitize.load_chart_names(str(p))


# --- index_label -------------------------------------------------------------


def test_index_label_splits_camel_case():
    assert digitize.index_label("011_Lucin.jpg") == "Lucin"
    assert digitize.index_label("049_Ibex-CrystalPeak.jpg") == "Ibex-Crystal Peak"
    assert digitize.index_label("070_Uinta Basin Maps.jpg") == "Uinta Basin Maps"


@pytest.mark.parametrize(
    "bad",
    ["001_Albion.JPG", "001_Albion.jpeg", "Albion.jpg", "0011_Lucin.jpg", "011_.jpg"],
)
def test_index_label_rejects_malformed_filenames(bad):
    """A filename that does not match NNN_Stem.jpg must raise, not fail open."""
    with pytest.raises(ValueError, match="chart filename"):
        digitize.index_label(bad)


def test_index_label_collisions_are_known_and_documented():
    """Two pairs of charts share a filename stem; both are recorded discrepancies.

    Pinning them here means a NEW collision - a genuinely mis-named file - shows
    up as a test failure instead of two identically labelled localities.
    """
    names = digitize.load_chart_names(str(DATA / "chart_names.csv"))
    seen: dict[str, list[int]] = {}
    for chart_id, fn in names.items():
        seen.setdefault(digitize.index_label(fn), []).append(chart_id)
    collisions = {k: sorted(v) for k, v in seen.items() if len(v) > 1}
    assert collisions == {
        "Wasatch Plateau": [66, 82],
        "Uinta Basin": [69, 72],
    }
    notes = json.loads((DATA / "label_discrepancies.json").read_text())
    for ids in collisions.values():
        assert any(str(i) in notes for i in ids), ids


# --- load_anchors ------------------------------------------------------------


def test_anchors_file_covers_every_chart_exactly_once():
    """The digitized anchors must be complete: ids 1..123, one each."""
    anchors = digitize.load_anchors(str(DATA / "anchors.json"))
    assert sorted(anchors) == list(range(1, 124))


def test_anchors_lie_inside_the_source_raster():
    """Every anchor must fall within the 3024x4032 source image."""
    anchors = digitize.load_anchors(str(DATA / "anchors.json"))
    for chart_id, (px, py) in anchors.items():
        assert 0 <= px < 3024, f"chart {chart_id} px out of range: {px}"
        assert 0 <= py < 4032, f"chart {chart_id} py out of range: {py}"


def test_anchors_are_distinct():
    """Two charts sharing a pixel would mean a number was digitized twice."""
    anchors = digitize.load_anchors(str(DATA / "anchors.json"))
    seen: dict[tuple[float, float], int] = {}
    for chart_id, pt in anchors.items():
        key = (round(pt[0]), round(pt[1]))
        assert key not in seen, f"charts {seen.get(key)} and {chart_id} share {key}"
        seen[key] = chart_id


@pytest.mark.parametrize(
    "payload", ['{"1": [1, 2, 3]}', '{"1": "37"}', '{"1": 5}', '{"1": [1]}']
)
def test_load_anchors_rejects_a_malformed_pair(tmp_path, payload):
    p = tmp_path / "bad.json"
    p.write_text(payload)
    with pytest.raises(ValueError, match="px, py"):
        digitize.load_anchors(str(p))


def test_load_anchors_rejects_keys_that_collapse_to_one_id(tmp_path):
    p = tmp_path / "collide.json"
    p.write_text('{"1": [1, 2], "01": [3, 4]}')
    with pytest.raises(ValueError, match="duplicate chart id"):
        digitize.load_anchors(str(p))


# --- anchors_to_localities ---------------------------------------------------


def test_anchors_to_localities_maps_every_anchor(monkeypatch):
    from strat_charts import georef

    monkeypatch.setattr(
        georef, "source_pixel_to_lonlat", lambda tif, pts: [(-111.9, 40.7)] * len(pts)
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


def test_anchors_to_localities_pairs_each_id_with_its_own_coordinate(monkeypatch):
    """The stub's output depends on its input, so a mispairing cannot hide.

    A stub returning one constant for every point (as the test above uses) would
    pass even if zip() paired coordinates with the wrong charts or in the wrong
    order. This one makes each coordinate traceable to the pixel it came from.
    """
    from strat_charts import georef

    monkeypatch.setattr(
        georef,
        "source_pixel_to_lonlat",
        lambda tif, pts: [(-p[0] / 100.0, p[1] / 100.0) for p in pts],
    )
    rows = digitize.anchors_to_localities(
        {2: (3000.0, 4000.0), 1: (1000.0, 2000.0)},
        "unused.tif",
        {1: "001_Albion.jpg", 2: "002_RaftRiver.jpg"},
    )
    by_id = {r["chart_id"]: r for r in rows}
    assert by_id[1]["longitude"] == -10.0 and by_id[1]["latitude"] == 20.0
    assert by_id[2]["longitude"] == -30.0 and by_id[2]["latitude"] == 40.0
    assert by_id[1]["index_label"] == "Albion"
    assert by_id[2]["index_label"] == "Raft River"


def test_anchors_without_a_name_raise(monkeypatch):
    """A stray anchor must fail loudly, before any transform work happens."""
    from strat_charts import georef

    calls = []
    monkeypatch.setattr(
        georef,
        "source_pixel_to_lonlat",
        lambda tif, pts: calls.append(pts) or [(-111.9, 40.7)],
    )
    with pytest.raises(KeyError, match="no chart entry"):
        digitize.anchors_to_localities({999: (1.0, 2.0)}, "unused.tif", {})
    assert calls == [], "the guard must fire before the transform is called"


def test_charts_without_an_anchor_raise(monkeypatch):
    """A chart with no anchor must raise rather than shorten the output."""
    from strat_charts import georef

    calls = []
    monkeypatch.setattr(
        georef,
        "source_pixel_to_lonlat",
        lambda tif, pts: calls.append(pts) or [(-111.9, 40.7)] * len(pts),
    )
    with pytest.raises(KeyError, match="no anchor"):
        digitize.anchors_to_localities(
            {1: (1.0, 2.0)},
            "unused.tif",
            {1: "001_Albion.jpg", 2: "002_RaftRiver.jpg", 3: "003_Strevell.jpg"},
        )
    assert calls == [], "the guard must fire before the transform is called"


# --- cross-checks against independent measurements ---------------------------


def test_anchors_agree_with_the_independent_check_point_measurements():
    """check_points.csv holds 18 glyph centroids measured for the accuracy task.

    They were digitized separately, on the same source raster, so they are an
    independent measurement of the same glyphs. The worst observed disagreement
    is 6.4 px (chart 118); 8 px keeps that as a regression guard rather than a
    tolerance wide enough to hide a re-digitization drifting off its glyph.
    """
    anchors = digitize.load_anchors(str(DATA / "anchors.json"))
    checked = 0
    for row in _read_csv(DATA / "check_points.csv"):
        chart_id = int(row["chart_id"])
        px, py = anchors[chart_id]
        dx = px - float(row["px"])
        dy = py - float(row["py"])
        assert math.hypot(dx, dy) < 8.0, (
            f"chart {chart_id} ({row['name']}): anchor ({px}, {py}) is "
            f"({dx:.1f}, {dy:.1f}) px from the check point"
        )
        checked += 1
    assert checked == 18, f"expected 18 check points, compared {checked}"


# --- end-to-end through the real transform -----------------------------------


@needs_raster
def test_anchors_to_localities_against_a_real_transform():
    """No mocks: run the digitized anchors through the actual TPS transform.

    Every locality must land inside Utah's bounding box. A mocked transform
    would pass this trivially; this one exercises georef end to end.
    """
    names = digitize.load_chart_names(str(DATA / "chart_names.csv"))
    anchors = digitize.load_anchors(str(DATA / "anchors.json"))
    rows = _rows(names, anchors)
    assert len(rows) == 123
    for row in rows:
        assert -114.6 <= row["longitude"] <= -108.6, row
        assert 36.5 <= row["latitude"] <= 42.5, row


@needs_raster
def test_localities_land_near_their_gnis_place():
    """Every chart in expected_localities.csv must land near the town it names.

    60 charts, against GNIS points chosen by name alone. The bound is 45 km
    because the book's glyph sits NEAR its locality, not on it: the measured
    residuals here run to 37.9 km for chart 115, whose label 'Monticello-Bluff'
    spans two towns and is drawn between them.
    """
    names = digitize.load_chart_names(str(DATA / "chart_names.csv"))
    anchors = digitize.load_anchors(str(DATA / "anchors.json"))
    rows = {r["chart_id"]: r for r in _rows(names, anchors)}
    truth = _read_csv(DATA / "expected_localities.csv")
    assert len(truth) == 60
    for t in truth:
        r = rows[int(t["chart_id"])]
        km = _km(r["longitude"], r["latitude"], float(t["lon"]), float(t["lat"]))
        assert km < 45.0, f"chart {t['chart_id']} is {km:.1f} km from {t['gnis_name']}"


# Charts held out of the strict rank check, with the reason each is held out.
# These are properties of the book's cartography, verified against the index-map
# image, not slack added to make a failing test pass.
RANK_EXCLUSIONS = {
    118: "label is 'Vernal NW', the quadrangle northwest of the town, not the town",
    94: "chart is 094_SouthernTusharMtns; GNIS gives the whole range's centre",
    36: "the book draws '36 Charleston' ~24 km east of Charleston, past Provo's glyph",
    64: "the book draws '64 Fairview' toward Moroni, nearer 63's town than its own",
}


@needs_raster
def test_localities_rank_nearest_their_own_gnis_place():
    """Each chart must be the single closest locality to the town it names.

    This, not an absolute distance, is what catches a swapped or transposed
    anchor: a swap pushes the chart off first place even when both points stay
    inside a generous radius. Ranking is over the charts in the truth set rather
    than all 123, so every candidate in the comparison has independent ground
    truth of its own.

    Strict first place, with four charts held out for documented cartographic
    reasons (RANK_EXCLUSIONS). Allowing second place instead of excluding them
    was measurably weaker: it let a 33/34 (Bingham / Salt Lake) swap and an 8/21
    (Portage / Clarkston) swap pass unnoticed.
    """
    names = digitize.load_chart_names(str(DATA / "chart_names.csv"))
    anchors = digitize.load_anchors(str(DATA / "anchors.json"))
    rows = {r["chart_id"]: r for r in _rows(names, anchors)}
    truth = {
        int(t["chart_id"]): (t["gnis_name"], float(t["lon"]), float(t["lat"]))
        for t in _read_csv(DATA / "expected_localities.csv")
        if int(t["chart_id"]) not in RANK_EXCLUSIONS
    }
    assert len(truth) == 56
    for chart_id, (name, lon, lat) in truth.items():
        order = sorted(
            truth,
            key=lambda c: _km(rows[c]["longitude"], rows[c]["latitude"], lon, lat),
        )
        assert order[0] == chart_id, (
            f"chart {chart_id} ({name}) ranks {order.index(chart_id) + 1} "
            f"for its own town; nearest are {order[:3]}"
        )


# --- recorded discrepancies --------------------------------------------------


def test_label_discrepancies_are_recorded_not_corrected():
    """Charts whose map label differs from the filename are documented."""
    notes = json.loads((DATA / "label_discrepancies.json").read_text())
    assert "72" in notes
    assert "Ouray" in notes["72"]["map_label"]
    assert notes["72"]["source_filename"] == "072_UintaBasin.jpg"


def test_label_discrepancies_reference_real_charts():
    """Every documented discrepancy must name a real chart and its true filename."""
    names = digitize.load_chart_names(str(DATA / "chart_names.csv"))
    notes = json.loads((DATA / "label_discrepancies.json").read_text())
    entries = {k: v for k, v in notes.items() if not k.startswith("_")}
    assert entries, "no discrepancies recorded"
    for key, entry in entries.items():
        chart_id = int(key)
        assert chart_id in names, f"discrepancy {key} is not a chart id"
        assert entry["source_filename"] == names[chart_id]
        assert entry["map_label"] and entry["note"]
