import pytest

from strat_charts import boundary


def test_six_corners():
    assert len(boundary.UTAH_CORNERS) == 6


def test_corners_are_named_and_ordered_counterclockwise():
    names = [c[0] for c in boundary.UTAH_CORNERS]
    assert len(set(names)) == 6, "corner names must be unique"


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


def test_notch_present():
    """Utah's NE notch: two corners share the Wyoming meridian."""
    lons = sorted(c[1] for c in boundary.UTAH_CORNERS)
    wyoming = [x for x in lons if -111.2 < x < -110.9]
    assert len(wyoming) == 2, "expected two corners on the Wyoming meridian"
