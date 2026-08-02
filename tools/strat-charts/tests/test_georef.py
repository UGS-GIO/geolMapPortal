import subprocess

import numpy as np
import pytest
from strat_charts import georef


def test_gcp_args_shape():
    gcps = [
        georef.Gcp("nw", 100.0, 200.0, -114.05, 42.0),
        georef.Gcp("se", 900.0, 800.0, -109.05, 37.0),
    ]
    args = georef.gcp_args(gcps)
    assert args.count("-gcp") == 2
    # gdal_translate wants: -gcp pixel line easting northing
    i = args.index("-gcp")
    assert args[i + 1 : i + 5] == ["100.0", "200.0", "-114.05", "42.0"]


def test_warp_reports_gdal_failure_loudly(tmp_path):
    """A GDAL failure must raise with stderr attached, never pass silently."""
    missing = str(tmp_path / "nope.png")
    gcps = [georef.Gcp("nw", 1.0, 1.0, -114.0, 42.0)]
    with pytest.raises(RuntimeError) as exc:
        georef.warp(missing, str(tmp_path / "out.tif"), gcps)
    assert "gdal" in str(exc.value).lower()


def test_build_gcps_pairs_every_named_corner():
    gcps = georef.build_gcps(
        {"nw": (250.5, 249.5)}, corner_lookup={"nw": (-114.05, 42.0)}
    )
    assert len(gcps) == 1
    assert gcps[0].px == 250.5
    assert gcps[0].lon == -114.05


def test_build_gcps_rejects_unknown_corner_name():
    """A typo must fail loudly, not silently drop a control point."""
    with pytest.raises(KeyError):
        georef.build_gcps({"bogus": (50.0, 50.0)}, corner_lookup={})


def test_build_gcps_is_deterministic_in_order():
    """gdal_translate takes GCPs positionally; a wandering order is a real bug."""
    lookup = {"nw": (-114.05, 42.0), "se": (-109.05, 37.0)}
    corners = {"se": (900.0, 800.0), "nw": (100.0, 200.0)}
    names = [g.name for g in georef.build_gcps(corners, corner_lookup=lookup)]
    assert names == sorted(names)
