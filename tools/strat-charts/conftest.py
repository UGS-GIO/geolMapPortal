"""One mechanism for every test that needs the photographed index map.

`out/` is gitignored, so nothing derived from the page photograph is committed.
That left four test modules each inventing their own answer to "what if the
raster is not there" - two guarded with a `skipif`, one guarded inline, and one
did not guard at all, so a fresh clone's first `pytest` was three hard failures
with no explanation. That is how a team learns to ignore a red suite.

The fixtures below replace all four. They regenerate what is missing from the
source photograph, and skip with a reason naming the exact file that could not be
produced when the source is not available either. So:

* a clone **with** the source photograph runs the whole suite, rebuilding
  `out/index_map_a.jpg` and `out/working_a.png` (and, for the end-to-end tests,
  the GCP-tagged raster) on first use;
* a clone **without** it skips the raster-dependent tests and passes the rest.

Nothing here swallows a failure: a conversion or warp that runs and fails raises,
because "the tool was present and produced nothing" is a broken toolchain and not
an absent input. Only a genuinely absent input skips.
"""

import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
OUT = ROOT / "out"

# The page photograph, as recorded in the design spec's Inputs table. Two frames
# of the same page were taken; IMG_4168 is the one every measurement in
# RESIDUALS.md was made against.
SOURCE_PHOTO = Path.home() / "Documents" / "temp_data" / "IMG_4168.HEIC"

INDEX_JPEG = OUT / "index_map_a.jpg"
WORKING_PNG = OUT / "working_a.png"
WARPED_TIF = OUT / "index_map.tif"
GCP_TIF = OUT / "index_map_gcp.tif"


def _run_or_raise(cmd: list[str], what: str) -> None:
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(
            f"{what} failed ({proc.returncode}): {' '.join(cmd)}\n{proc.stderr}"
        )


@pytest.fixture(scope="session")
def index_photo() -> Path:
    """`out/index_map_a.jpg`, converted from the HEIC source if it is missing.

    `sips` is macOS-native and is what produced the committed measurements; it is
    also the only HEIC decoder this project may assume, since the dependency list
    is Pillow, NumPy, Matplotlib and pytest only.
    """
    if INDEX_JPEG.exists():
        return INDEX_JPEG
    if not SOURCE_PHOTO.exists():
        pytest.skip(
            f"{INDEX_JPEG} is not built and the source photograph {SOURCE_PHOTO} "
            "is not available to build it from"
        )
    sips = shutil.which("sips")
    if sips is None:
        pytest.skip(
            f"{INDEX_JPEG} is not built and no `sips` is available to convert "
            f"{SOURCE_PHOTO}; convert the HEIC to JPEG by any means and rerun"
        )
    OUT.mkdir(parents=True, exist_ok=True)
    _run_or_raise(
        [sips, "-s", "format", "jpeg", str(SOURCE_PHOTO), "--out", str(INDEX_JPEG)],
        f"converting {SOURCE_PHOTO} to {INDEX_JPEG}",
    )
    if not INDEX_JPEG.exists():
        raise RuntimeError(f"sips reported success but did not write {INDEX_JPEG}")
    return INDEX_JPEG


@pytest.fixture(scope="session")
def working_raster(index_photo) -> Path:
    """`out/working_a.png`: the oriented, lossless raster every measurement uses."""
    if WORKING_PNG.exists():
        return WORKING_PNG
    from strat_charts import orient

    orient.write_working_raster(str(index_photo), str(WORKING_PNG))
    if not WORKING_PNG.exists():
        raise RuntimeError(f"write_working_raster did not write {WORKING_PNG}")
    return WORKING_PNG


@pytest.fixture(scope="session")
def corner_seeds() -> dict:
    """The committed seed corners. Seeds only bracket an edge; see `perimeter`."""
    return json.loads((DATA / "corner_seeds.json").read_text())["seeds"]


@pytest.fixture(scope="session")
def real_raster(working_raster, corner_seeds):
    """`(gray, seeds)` for the real photograph - the measurement that counts.

    Read once per session: `build_perimeter` runs on it repeatedly and decoding an
    8 MB PNG for each test is pure overhead.
    """
    import numpy as np
    from PIL import Image

    gray = np.asarray(Image.open(working_raster).convert("L"), dtype=float)
    return gray, corner_seeds


@pytest.fixture(scope="session")
def gcp_tif(working_raster, real_raster) -> str:
    """`out/index_map_gcp.tif`: the GCP-tagged intermediate, built if missing.

    This is the raster the end-to-end tests transform through. It is the tagged
    intermediate, never the warped output - the two are different pixel spaces and
    confusing them once cost 27-124 km of apparent error (see `georef`).

    Rebuilt if it is older than the raster it was derived from. A stale tag file
    is worse than a missing one: it transforms, so every test downstream passes
    while measuring a georeference nothing else in the run agrees with.
    """
    if GCP_TIF.exists() and GCP_TIF.stat().st_mtime >= working_raster.stat().st_mtime:
        return str(GCP_TIF)
    missing = [t for t in ("gdal_translate", "gdalwarp") if shutil.which(t) is None]
    if missing:
        pytest.skip(
            f"{GCP_TIF} is not built and the GDAL command-line tool(s) "
            f"{', '.join(missing)} are not installed to build it"
        )
    from strat_charts import accuracy, georef, perimeter

    gray, seeds = real_raster
    gcps = accuracy.gcps_from_perimeter(perimeter.build_perimeter_gcps(gray, seeds))
    georef.warp(str(working_raster), str(WARPED_TIF), gcps)
    if not GCP_TIF.exists():
        raise RuntimeError(f"georef.warp did not write {GCP_TIF}")
    return str(GCP_TIF)
