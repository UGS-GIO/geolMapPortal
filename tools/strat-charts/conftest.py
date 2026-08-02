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

from strat_charts import georef

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
OUT = ROOT / "out"
PACKAGE = ROOT / "strat_charts"

# The page photograph, as recorded in the design spec's Inputs table. Two frames
# of the same page were taken; IMG_4168 is the one every measurement in
# RESIDUALS.md was made against.
SOURCE_PHOTO = Path.home() / "Documents" / "temp_data" / "IMG_4168.HEIC"

INDEX_JPEG = OUT / "index_map_a.jpg"
WORKING_PNG = OUT / "working_a.png"
WARPED_TIF = OUT / "index_map.tif"
# Derived, not spelled again: `gcp_tagged_path` is where `georef.warp` puts the
# tagged intermediate, and a second hardcoded copy of that name is exactly the
# drift the helper exists to prevent.
GCP_TIF = Path(georef.gcp_tagged_path(str(WARPED_TIF)))

# A build times out rather than hanging the session with no output. `sips` on a
# 1.5 MB HEIC and `gdalwarp` over a 3024x4032 raster are seconds of work; ten
# minutes means something is wrong, and a hung subprocess under `capture_output`
# prints nothing while it waits.
BUILD_TIMEOUT_S = 600


def _run_or_raise(cmd: list[str], what: str) -> None:
    try:
        proc = subprocess.run(
            cmd, capture_output=True, text=True, timeout=BUILD_TIMEOUT_S
        )
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError(
            f"{what} did not finish within {BUILD_TIMEOUT_S}s: {' '.join(cmd)}"
        ) from exc
    if proc.returncode != 0:
        raise RuntimeError(
            f"{what} failed ({proc.returncode}): {' '.join(cmd)}\n{proc.stderr}"
        )


def _is_stale(artifact: Path, sources) -> bool:
    """Is `artifact` older than anything it was derived from?

    A stale derived raster is worse than a missing one: it loads, it transforms,
    and every test downstream passes while measuring something the current code
    would not produce. The sources include the modules that do the deriving, not
    only the input raster - changing a constant in `perimeter.py` leaves
    `working_a.png` untouched, so an mtime check against the raster alone would
    happily reuse a tag file built from the old constants.
    """
    if not artifact.exists():
        return True
    stamp = artifact.stat().st_mtime
    return any(s.exists() and s.stat().st_mtime > stamp for s in sources)


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
def working_raster(request) -> Path:
    """`out/working_a.png`: the oriented, lossless raster every measurement uses.

    Rebuilt when it is older than the photograph or than `orient.py` itself. The
    `index_photo` fixture is resolved only if a rebuild is actually needed, so a
    tree that has the PNG but not the JPEG - and no source photograph to make one
    from - still runs instead of skipping on an input it does not need.
    """
    if not _is_stale(WORKING_PNG, (INDEX_JPEG, PACKAGE / "orient.py")):
        return WORKING_PNG
    from strat_charts import orient

    photo = request.getfixturevalue("index_photo")
    orient.write_working_raster(str(photo), str(WORKING_PNG))
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


# Everything the tagged raster is derived from. `conftest.py` is now the only
# thing in the repo that writes it - no CLI or pipeline module does - so if this
# list misses a source, nothing else will ever rebuild it. `perimeter.py` places
# the control points, `accuracy.py` names them, `georef.py` tags and warps, and
# `corner_seeds.json` says where to start; a change to any of them makes an
# existing tag file describe a georeference the current code would not produce.
_GCP_TIF_SOURCES = (
    WORKING_PNG,
    DATA / "corner_seeds.json",
    PACKAGE / "perimeter.py",
    PACKAGE / "accuracy.py",
    PACKAGE / "georef.py",
    PACKAGE / "boundary.py",
)


@pytest.fixture(scope="session")
def gcp_tif(working_raster, real_raster) -> str:
    """`out/index_map_gcp.tif`: the GCP-tagged intermediate, built if missing.

    This is the raster the end-to-end tests transform through. It is the tagged
    intermediate, never the warped output - the two are different pixel spaces and
    confusing them once cost 27-124 km of apparent error (see `georef`).

    Rebuilt when it is older than anything it was derived from, modules included.
    A stale tag file is worse than a missing one: it transforms, so every test
    downstream passes while measuring a georeference nothing else in the run
    agrees with. The golden control-set test would catch a `perimeter` change on
    its own; nothing would catch a change in `accuracy` or `georef`.
    """
    if not _is_stale(GCP_TIF, _GCP_TIF_SOURCES):
        return str(GCP_TIF)
    missing = [t for t in ("gdal_translate", "gdalwarp") if shutil.which(t) is None]
    if missing:
        pytest.skip(
            f"{GCP_TIF} is not built and the GDAL command-line tool(s) "
            f"{', '.join(missing)} are not installed to build it"
        )
    from strat_charts import accuracy, perimeter

    gray, seeds = real_raster
    gcps = accuracy.gcps_from_perimeter(perimeter.build_perimeter_gcps(gray, seeds))
    georef.warp(str(working_raster), str(WARPED_TIF), gcps)
    if not GCP_TIF.exists():
        raise RuntimeError(f"georef.warp did not write {GCP_TIF}")
    return str(GCP_TIF)
