import math

import pytest
from strat_charts import accuracy


def test_haversine_known_distance():
    """One degree of latitude is about 111 km anywhere on the globe."""
    d = accuracy.haversine_m(-111.0, 40.0, -111.0, 41.0)
    assert 110_500 < d < 111_500


def test_haversine_zero_for_identical_points():
    assert accuracy.haversine_m(-111.9, 40.76, -111.9, 40.76) == pytest.approx(0.0)


def test_haversine_is_symmetric():
    a = accuracy.haversine_m(-114.0, 42.0, -109.0, 37.0)
    b = accuracy.haversine_m(-109.0, 37.0, -114.0, 42.0)
    assert a == pytest.approx(b)


def test_check_point_residuals_computes_error(monkeypatch):
    from strat_charts import georef

    # source_pixel_to_lonlat, not pixel_to_lonlat: px/py are measured on the
    # SOURCE raster. Patching the wrong one here would let a call to the wrong
    # transform pass the suite, which is exactly the 27-124 km bug.
    monkeypatch.setattr(
        georef, "source_pixel_to_lonlat", lambda tif, pts: [(-111.9, 40.76)]
    )
    rows = accuracy.check_point_residuals(
        "unused.tif",
        [{"name": "slc", "px": 10.0, "py": 20.0, "lon": -111.891, "lat": 40.7608}],
    )
    assert len(rows) == 1
    assert rows[0]["error_m"] > 0
    assert rows[0]["error_m"] < 2000


def test_check_point_residuals_rejects_length_mismatch(monkeypatch):
    from strat_charts import georef

    monkeypatch.setattr(georef, "source_pixel_to_lonlat", lambda tif, pts: [])
    with pytest.raises(RuntimeError):
        accuracy.check_point_residuals(
            "unused.tif",
            [{"name": "slc", "px": 1.0, "py": 1.0, "lon": -111.9, "lat": 40.8}],
        )


def test_check_point_residuals_uses_the_source_pixel_transform(monkeypatch):
    """Guard the coordinate-system distinction itself.

    ``pixel_to_lonlat`` reads the warped output's affine grid; ``px``/``py`` here
    are source-image pixels. Feeding one to the other is silent - it returns
    plausible coordinates that are 27-124 km wrong - so the choice is asserted
    rather than left to review.
    """
    from strat_charts import georef

    def explode(tif, pts):
        raise AssertionError("check points must not go through pixel_to_lonlat")

    monkeypatch.setattr(georef, "pixel_to_lonlat", explode)
    monkeypatch.setattr(
        georef, "source_pixel_to_lonlat", lambda tif, pts: [(-111.9, 40.76)]
    )
    rows = accuracy.check_point_residuals(
        "unused.tif",
        [{"name": "slc", "px": 10.0, "py": 20.0, "lon": -111.9, "lat": 40.76}],
    )
    assert rows[0]["error_m"] == pytest.approx(0.0)


def test_check_point_residuals_passes_the_tagged_tif_through(monkeypatch):
    """The tif argument must reach the transform, not be shadowed or ignored."""
    from strat_charts import georef

    seen = {}

    def record(tif, pts):
        seen["tif"] = tif
        seen["pts"] = pts
        return [(-111.9, 40.76)]

    monkeypatch.setattr(georef, "source_pixel_to_lonlat", record)
    accuracy.check_point_residuals(
        "/tmp/index_map_gcp.tif",
        [{"name": "slc", "px": 10.0, "py": 20.0, "lon": -111.9, "lat": 40.76}],
    )
    assert seen["tif"] == "/tmp/index_map_gcp.tif"
    assert seen["pts"] == [(10.0, 20.0)]


def test_loo_residuals_rejects_too_few_gcps():
    from strat_charts import georef

    gcps = [georef.Gcp(f"g{i}", i, i, -112.0 + i, 38.0 + i) for i in range(3)]
    with pytest.raises(ValueError):
        accuracy.loo_residuals(gcps, "unused.png", "unused_dir")


def test_loo_residuals_holds_each_point_out(monkeypatch, tmp_path):
    """Every GCP is held out exactly once, and never used to predict itself."""
    from strat_charts import georef

    gcps = [georef.Gcp(f"g{i}", i, i, -112.0 + i, 38.0 + i) for i in range(5)]
    warped = []

    def fake_warp(src, dst, rest):
        warped.append([g.name for g in rest])
        return dst

    monkeypatch.setattr(georef, "warp", fake_warp)
    monkeypatch.setattr(
        georef, "source_pixel_to_lonlat", lambda tif, pts: [(-112.0, 38.0)]
    )
    rows = accuracy.loo_residuals(gcps, "src.png", str(tmp_path))

    assert [name for name, _ in rows] == [g.name for g in gcps]
    assert len(warped) == 5
    for held, used in zip(gcps, warped):
        assert held.name not in used
        assert len(used) == 4
    # g0 sits at (-112, 38), which is what the stub predicts, so it must be the
    # only zero. A stub-shaped assertion like "all errors are finite" would hold
    # however the residual was computed.
    assert rows[0][1] == pytest.approx(0.0)
    assert all(err > 1.0 for _, err in rows[1:])


def test_loo_residuals_feeds_the_tagged_tif_and_the_held_out_source_pixel(
    monkeypatch, tmp_path
):
    """Guard the two arguments the LOO prediction turns on.

    Both were silently wrong-able: passing the warped ``tif`` instead of
    ``gcp_tagged_path(tif)`` puts source pixels on the output's affine grid -
    the 27-124 km defect this module exists to prevent - and passing
    ``(lon, lat)`` or a transposed ``(py, px)`` is equally invisible. A stub
    that ignores its arguments lets all three through.
    """
    from strat_charts import georef

    gcps = [georef.Gcp(f"g{i}", 10.0 + i, 20.0 + i, -112.0 + i, 38.0 + i)
            for i in range(5)]
    seen = []

    monkeypatch.setattr(georef, "warp", lambda src, dst, rest: dst)

    def record(tif, pts):
        seen.append((tif, list(pts)))
        return [(-112.0, 38.0)]

    monkeypatch.setattr(georef, "source_pixel_to_lonlat", record)
    accuracy.loo_residuals(gcps, "src.png", str(tmp_path))

    assert len(seen) == 5
    for held, (tif, pts) in zip(gcps, seen):
        assert tif.endswith("_gcp.tif"), tif
        assert tif == georef.gcp_tagged_path(str(tmp_path / f"loo_{held.name}.tif"))
        assert pts == [(held.px, held.py)]


def test_loo_residuals_rejects_the_warped_output_transform(monkeypatch, tmp_path):
    """The LOO path must never reach ``pixel_to_lonlat``."""
    from strat_charts import georef

    def explode(tif, pts):
        raise AssertionError("held-out points must not go through pixel_to_lonlat")

    monkeypatch.setattr(georef, "pixel_to_lonlat", explode)
    monkeypatch.setattr(georef, "warp", lambda src, dst, rest: dst)
    monkeypatch.setattr(
        georef, "source_pixel_to_lonlat", lambda tif, pts: [(-112.0, 38.0)]
    )
    gcps = [georef.Gcp(f"g{i}", i, i, -112.0 + i, 38.0 + i) for i in range(4)]
    assert len(accuracy.loo_residuals(gcps, "src.png", str(tmp_path))) == 4


def test_accuracy_module_never_names_the_output_pixel_transform():
    """A source-level guard, because the monkeypatch guards can be refactored away.

    Every guard above intercepts through the module attribute. Rewriting the
    import as ``from .georef import pixel_to_lonlat`` would leave them all green
    while the code used the wrong transform.
    """
    from pathlib import Path

    src = (Path(__file__).resolve().parents[1]
           / "strat_charts" / "accuracy.py").read_text()
    code = "\n".join(
        line for line in src.splitlines() if not line.lstrip().startswith("#")
    )
    body = code.split('"""', 2)[-1]          # drop the module docstring, which names it
    assert "pixel_to_lonlat" not in body.replace("source_pixel_to_lonlat", "")


def test_summarise_reports_min_median_max_rmse():
    s = accuracy.summarise([3.0, 1.0, 5.0])
    assert s["n"] == 3
    assert s["min"] == 1.0
    assert s["median"] == 3.0
    assert s["max"] == 5.0
    assert s["rmse"] == pytest.approx(math.sqrt((9 + 1 + 25) / 3))


def test_summarise_median_of_even_count():
    assert accuracy.summarise([1.0, 2.0, 3.0, 4.0])["median"] == pytest.approx(2.5)


def test_summarise_rejects_empty():
    with pytest.raises(ValueError):
        accuracy.summarise([])


def _write_csv(tmp_path, body):
    p = tmp_path / "check_points.csv"
    p.write_text("name,chart_id,px,py,lon,lat,source,retrieved\n" + body)
    return str(p)


def test_load_check_points_reads_numbers(tmp_path):
    path = _write_csv(tmp_path, "Moab,113,1000,2000,-109.5498395,38.5733155,GNIS,2026-08-02\n")
    rows = accuracy.load_check_points(path)
    assert rows == [
        {
            "name": "Moab",
            "chart_id": "113",
            "px": 1000.0,
            "py": 2000.0,
            "lon": -109.5498395,
            "lat": 38.5733155,
            "source": "GNIS",
            "retrieved": "2026-08-02",
        }
    ]


def test_load_check_points_rejects_blank_pixel(tmp_path):
    """A row with no digitized pixel must fail, not silently shrink the sample."""
    path = _write_csv(tmp_path, "Moab,113,,2000,-109.5,38.6,GNIS,2026-08-02\n")
    with pytest.raises(ValueError, match="px is blank"):
        accuracy.load_check_points(path)


def test_load_check_points_rejects_non_numeric(tmp_path):
    path = _write_csv(tmp_path, "Moab,113,1000,2000,west,38.6,GNIS,2026-08-02\n")
    with pytest.raises(ValueError, match="not a number"):
        accuracy.load_check_points(path)


def test_load_check_points_rejects_empty_file(tmp_path):
    with pytest.raises(ValueError, match="no check points"):
        accuracy.load_check_points(_write_csv(tmp_path, ""))


def test_load_check_points_rejects_missing_column(tmp_path):
    p = tmp_path / "bad.csv"
    p.write_text("name,px,py\nMoab,1,2\n")
    with pytest.raises(ValueError, match="missing column"):
        accuracy.load_check_points(str(p))


def test_load_check_points_skips_comment_lines(tmp_path):
    """The gazetteer citation lives in the CSV, so '#' lines must not be data."""
    p = tmp_path / "c.csv"
    p.write_text(
        "# source: GNIS DomesticNames_UT, retrieved 2026-08-02\n"
        "name,chart_id,px,py,lon,lat,source,retrieved\n"
        "Moab,113,1,2,-109.5,38.6,GNIS,2026-08-02\n"
    )
    rows = accuracy.load_check_points(str(p))
    assert [r["name"] for r in rows] == ["Moab"]


def test_committed_check_points_load_and_are_in_range():
    """The committed table must parse and sit inside the source raster and Utah."""
    from pathlib import Path

    path = Path(__file__).resolve().parents[1] / "data" / "check_points.csv"
    rows = accuracy.load_check_points(str(path))
    assert len(rows) == 18, "README quotes 18 check points"
    assert len({r["name"] for r in rows}) == len(rows)
    for r in rows:
        assert 0.0 < r["px"] < 3024.0, r
        assert 0.0 < r["py"] < 4032.0, r
        assert -114.06 < r["lon"] < -109.04, r
        assert 36.99 < r["lat"] < 42.01, r
        assert r["source"].startswith("GNIS")


# --- non-finite values must not reach a statistic -------------------------

@pytest.mark.parametrize("bad", ["nan", "inf", "-inf", "1e999"])
def test_load_check_points_rejects_non_finite(tmp_path, bad):
    """float() accepts these; every statistic downstream then hides them."""
    path = _write_csv(tmp_path, f"Moab,113,1000,{bad},-109.5,38.6,GNIS,2026-08-02\n")
    with pytest.raises(ValueError, match="not a finite number"):
        accuracy.load_check_points(path)


def test_summarise_rejects_non_finite():
    """A nan sorts unpredictably, so min and max would look plausible and be wrong."""
    with pytest.raises(ValueError, match="not a finite number"):
        accuracy.summarise([1.0, float("nan"), 3.0])


def test_check_point_residuals_rejects_non_finite_prediction(monkeypatch):
    """gdaltransform can emit inf for a point outside the spline's hull."""
    from strat_charts import georef

    monkeypatch.setattr(
        georef, "source_pixel_to_lonlat", lambda tif, pts: [(float("inf"), 38.0)]
    )
    with pytest.raises(ValueError, match="not a finite number"):
        accuracy.check_point_residuals(
            "unused.tif",
            [{"name": "slc", "px": 1.0, "py": 1.0, "lon": -111.9, "lat": 40.8}],
        )


# --- required text fields ------------------------------------------------

@pytest.mark.parametrize("field", ["name", "chart_id", "source", "retrieved"])
def test_load_check_points_requires_text_fields(tmp_path, field):
    cols = {"name": "Moab", "chart_id": "113", "px": "1", "py": "2",
            "lon": "-109.5", "lat": "38.6", "source": "GNIS",
            "retrieved": "2026-08-02"}
    cols[field] = ""
    path = _write_csv(tmp_path, ",".join(cols[c] for c in accuracy.CHECK_POINT_FIELDS) + "\n")
    with pytest.raises(ValueError, match=f"{field} is blank"):
        accuracy.load_check_points(path)


def test_load_check_points_rejects_short_row(tmp_path):
    """A short row gives DictReader's restval, i.e. a null citation."""
    path = _write_csv(tmp_path, "Moab,113,1,2,-109.5,38.6\n")
    with pytest.raises(ValueError, match="source is blank"):
        accuracy.load_check_points(path)


def test_load_check_points_rejects_extra_columns(tmp_path):
    path = _write_csv(tmp_path, "Moab,113,1,2,-109.5,38.6,GNIS,2026-08-02,junk\n")
    with pytest.raises(ValueError, match="extra column"):
        accuracy.load_check_points(path)


def test_load_check_points_rejects_duplicate_names(tmp_path):
    row = "Moab,113,1,2,-109.5,38.6,GNIS,2026-08-02\n"
    with pytest.raises(ValueError, match="duplicate check point name"):
        accuracy.load_check_points(_write_csv(tmp_path, row + row))


# --- naming the perimeter's bare tuples ----------------------------------

def test_gcps_from_perimeter_names_points_in_order():
    gcps = accuracy.gcps_from_perimeter([(1.0, 2.0, -112.0, 38.0),
                                         (3.0, 4.0, -113.0, 39.0)])
    assert [g.name for g in gcps] == ["p000", "p001"]
    assert gcps[1] == ("p001", 3.0, 4.0, -113.0, 39.0)


def test_gcps_from_perimeter_names_are_path_safe(tmp_path):
    """loo_residuals builds a filename from the name; it must not escape workdir."""
    import os

    for g in accuracy.gcps_from_perimeter([(1.0, 2.0, -112.0, 38.0)] * 3):
        assert os.sep not in g.name and ".." not in g.name and "." not in g.name


def test_gcps_from_perimeter_rejects_wrong_arity():
    with pytest.raises(ValueError, match="expected"):
        accuracy.gcps_from_perimeter([(1.0, 2.0, -112.0)])


def test_gcps_from_perimeter_rejects_non_finite():
    with pytest.raises(ValueError, match="not a finite number"):
        accuracy.gcps_from_perimeter([(1.0, float("nan"), -112.0, 38.0)])


def test_gcps_from_perimeter_rejects_empty():
    with pytest.raises(ValueError, match="no perimeter control points"):
        accuracy.gcps_from_perimeter([])


# --- offsets and bias ----------------------------------------------------

def test_check_point_offsets_reports_glyph_minus_predicted_pixel(monkeypatch):
    from strat_charts import georef

    monkeypatch.setattr(
        georef, "source_pixel_to_lonlat", lambda tif, pts: [(-111.9, 40.76)]
    )
    monkeypatch.setattr(accuracy, "source_pixel_of", lambda tif, ll: [(90.0, 180.0)])
    rows = accuracy.check_point_offsets(
        "unused.tif",
        [{"name": "slc", "px": 100.0, "py": 200.0, "lon": -111.9, "lat": 40.76}],
    )
    assert rows[0]["pred_px"] == 90.0 and rows[0]["pred_py"] == 180.0
    assert rows[0]["dx"] == 10.0 and rows[0]["dy"] == 20.0


def test_check_point_offsets_rejects_length_mismatch(monkeypatch):
    from strat_charts import georef

    monkeypatch.setattr(
        georef, "source_pixel_to_lonlat", lambda tif, pts: [(-111.9, 40.76)]
    )
    monkeypatch.setattr(accuracy, "source_pixel_of", lambda tif, ll: [])
    with pytest.raises(RuntimeError, match="inverse transform"):
        accuracy.check_point_offsets(
            "unused.tif",
            [{"name": "slc", "px": 1.0, "py": 2.0, "lon": -111.9, "lat": 40.76}],
        )


def _offset_rows(pairs):
    return [{"name": f"n{i}", "px": 100.0 + 10 * i, "py": 200.0 + 10 * i,
             "dx": dx, "dy": dy} for i, (dx, dy) in enumerate(pairs)]


def test_offset_bias_finds_no_bias_in_symmetric_scatter():
    b = accuracy.offset_bias(_offset_rows([(10, 0), (-10, 0), (0, 10), (0, -10)]))
    assert b["mean_dx"] == pytest.approx(0.0)
    assert b["mean_dy"] == pytest.approx(0.0)
    assert b["rms_offset"] == pytest.approx(10.0)
    assert b["n"] == 4


def test_offset_bias_finds_a_real_shift():
    """A constant eastward shift on top of scatter must survive as a mean."""
    b = accuracy.offset_bias(_offset_rows([(50, 5), (50, -5), (50, 3), (50, -3)]))
    assert b["mean_dx"] == pytest.approx(50.0)
    assert b["se_dx"] == pytest.approx(0.0)
    assert b["mean_dy"] == pytest.approx(0.0)


def test_offset_bias_finds_a_position_correlated_warp():
    """A stretch about the origin makes dx grow with px - the warp signature."""
    rows = [{"name": f"n{i}", "px": float(p), "py": float(p) / 2,
             "dx": 0.1 * p, "dy": 1.0 if i % 2 else -1.0}
            for i, p in enumerate((0, 100, 200, 300))]
    assert accuracy.offset_bias(rows)["corr_dx_px"] == pytest.approx(1.0)


def test_offset_bias_rejects_too_few_points():
    with pytest.raises(ValueError, match="at least 3"):
        accuracy.offset_bias(_offset_rows([(1, 1), (2, 2)]))


def test_offset_bias_rejects_non_finite():
    with pytest.raises(ValueError, match="not a finite number"):
        accuracy.offset_bias(_offset_rows([(1, 1), (2, 2), (float("nan"), 3)]))


def test_offset_bias_reports_undefined_correlation_as_none_not_zero():
    """Zero means 'measured, no warp'. Undefined must not borrow that value."""
    rows = [{"name": f"n{i}", "px": 5.0, "py": 5.0, "dx": float(i), "dy": float(i)}
            for i in range(4)]
    b = accuracy.offset_bias(rows)
    assert b["corr_dx_px"] is None
    assert b["corr_dy_py"] is None
    assert b["mean_dx"] == pytest.approx(1.5)


def test_offset_bias_survives_a_pure_shift_with_no_scatter():
    """A constant offset is a real input - it is exactly what a warp looks like."""
    b = accuracy.offset_bias(_offset_rows([(50, 50)] * 4))
    assert b["mean_dx"] == pytest.approx(50.0)
    assert b["rms_offset"] == pytest.approx(math.hypot(50.0, 50.0))
    assert b["corr_dx_px"] is None
