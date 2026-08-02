"""Warp the index-map raster to EPSG:4326 with a thin-plate spline.

TPS rather than a polynomial: the source is a hand-held photograph of a bound
page, so the distortion is a smooth but non-projective bend that a first- or
second-order polynomial cannot absorb.
"""

import subprocess
from collections import namedtuple

import numpy as np

from .boundary import UTAH_CORNERS

Gcp = namedtuple("Gcp", "name px py lon lat")


def _corner_lookup() -> dict[str, tuple[float, float]]:
    return {name: (lon, lat) for name, lon, lat in UTAH_CORNERS}


def build_gcps(
    corners: dict[str, tuple[float, float]],
    corner_lookup: dict[str, tuple[float, float]] | None = None,
) -> list[Gcp]:
    """Pair located pixel corners with their geographic coordinates.

    ``corners`` comes from ``edges.corners_from_edges``. Locating them is that
    module's job; this one only pairs pixels with geography.

    Sorted by name so the GCP order is stable across runs - gdal_translate
    consumes them positionally.

    Raises KeyError if a corner has no known coordinate - a typo must fail
    loudly rather than silently drop a control point.
    """
    lookup = _corner_lookup() if corner_lookup is None else corner_lookup
    gcps = []
    for name in sorted(corners):
        if name not in lookup:
            raise KeyError(f"no geographic coordinate for corner {name!r}")
        px, py = corners[name]
        lon, lat = lookup[name]
        gcps.append(Gcp(name, float(px), float(py), lon, lat))
    return gcps


def gcp_args(gcps: list[Gcp]) -> list[str]:
    """gdal_translate -gcp arguments: pixel line easting northing."""
    args: list[str] = []
    for g in gcps:
        args += ["-gcp", str(g.px), str(g.py), str(g.lon), str(g.lat)]
    return args


def _run(cmd: list[str]) -> str:
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(
            f"gdal command failed ({proc.returncode}): {' '.join(cmd)}\n{proc.stderr}"
        )
    return proc.stdout


def warp(src_png: str, dst_tif: str, gcps: list[Gcp]) -> str:
    """Attach GCPs then warp to EPSG:4326 with a thin-plate spline."""
    tagged = dst_tif.replace(".tif", "_gcp.tif")
    _run(
        ["gdal_translate", "-of", "GTiff", "-a_srs", "EPSG:4326"]
        + gcp_args(gcps)
        + [src_png, tagged]
    )
    _run(
        ["gdalwarp", "-r", "bilinear", "-tps", "-t_srs", "EPSG:4326",
         "-overwrite", tagged, dst_tif]
    )
    return dst_tif


def gcp_tagged_path(dst_tif: str) -> str:
    """Path of the GCP-carrying intermediate that ``warp`` writes."""
    return dst_tif.replace(".tif", "_gcp.tif")


def source_pixel_to_lonlat(
    gcp_tif: str, points: list[tuple[float, float]]
) -> list[tuple[float, float]]:
    """Transform SOURCE-image pixels through the TPS built from the GCPs.

    Use this for any pixel measured on the ORIGINAL raster. It is not
    interchangeable with ``pixel_to_lonlat``: the warped output has its own
    pixel grid (3626x3653 against the source's 3024x4032), so feeding source
    pixels to the output's affine transform silently yields errors of 27-124 km.
    Two functions rather than one flag, because that distinction is invisible
    at the call site and produced exactly that bug.
    """
    return _gdaltransform(["gdaltransform", "-output_xy", "-tps", gcp_tif], points)


def pixel_to_lonlat(
    tif: str, points: list[tuple[float, float]]
) -> list[tuple[float, float]]:
    """Transform pixels measured on the WARPED raster to geographic coordinates.

    For pixels measured on the source image use ``source_pixel_to_lonlat``.
    """
    return _gdaltransform(["gdaltransform", "-output_xy", tif], points)


def _gdaltransform(
    cmd: list[str], points: list[tuple[float, float]]
) -> list[tuple[float, float]]:
    if not points:
        return []
    stdin = "\n".join(f"{x} {y}" for x, y in points) + "\n"
    proc = subprocess.run(cmd, input=stdin, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"gdaltransform failed: {proc.stderr}")
    out = []
    for line in proc.stdout.strip().splitlines():
        parts = line.split()
        out.append((float(parts[0]), float(parts[1])))
    if len(out) != len(points):
        raise RuntimeError(
            f"gdaltransform returned {len(out)} results for {len(points)} inputs"
        )
    return out
