from strat_charts import boundary


def test_six_corners():
    assert len(boundary.UTAH_CORNERS) == 6


def test_corners_are_named_and_ordered_counterclockwise():
    names = [c[0] for c in boundary.UTAH_CORNERS]
    assert len(set(names)) == 6, "corner names must be unique"


def test_corners_bracket_utah():
    lons = [c[1] for c in boundary.UTAH_CORNERS]
    lats = [c[2] for c in boundary.UTAH_CORNERS]
    assert -114.2 < min(lons) < -113.9
    assert -109.2 < max(lons) < -108.9
    assert 36.9 < min(lats) < 37.1
    assert 41.9 < max(lats) < 42.1


def test_notch_present():
    """Utah's NE notch: two corners share the Wyoming meridian."""
    lons = sorted(c[1] for c in boundary.UTAH_CORNERS)
    wyoming = [x for x in lons if -111.2 < x < -110.9]
    assert len(wyoming) == 2, "expected two corners on the Wyoming meridian"
