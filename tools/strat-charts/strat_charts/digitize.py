"""Turn digitized label anchors into locality rows."""

import csv
import json
import re

from . import georef

_FILENAME_RE = re.compile(r"^(\d{3})_(.+)\.jpg$")


def load_chart_names(path: str) -> dict[int, str]:
    """Read the canonical chart id -> filename map.

    Raises ValueError on a repeated chart id: dict assignment would silently
    keep the last row and the file would look complete while a chart was gone.
    """
    out: dict[int, str] = {}
    with open(path, newline="") as fh:
        for row in csv.DictReader(fh):
            chart_id = int(row["chart_id"])
            if chart_id in out:
                raise ValueError(f"duplicate chart_id {chart_id} in {path}")
            out[chart_id] = row["source_filename"]
    return out


def load_anchors(path: str) -> dict[int, tuple[float, float]]:
    """Read digitized SOURCE-pixel anchors, keyed by integer chart id.

    JSON object keys are strings; converting here keeps every caller working in
    the same key type as ``load_chart_names``.

    Raises ValueError on a malformed entry or on two keys that collapse to the
    same id (``"1"`` and ``"01"``) - both would otherwise be absorbed silently.
    """
    with open(path) as fh:
        raw = json.load(fh)
    out: dict[int, tuple[float, float]] = {}
    for key, value in raw.items():
        if not isinstance(value, list) or len(value) != 2:
            raise ValueError(f"anchor {key} is not a [px, py] pair: {value!r}")
        chart_id = int(key)
        if chart_id in out:
            raise ValueError(f"duplicate chart id {chart_id} in {path}")
        out[chart_id] = (float(value[0]), float(value[1]))
    return out


def index_label(source_filename: str) -> str:
    """Human label from the filename stem: '011_Lucin.jpg' -> 'Lucin'.

    This is the *filename* label, retained as provenance. The authoritative
    title comes from the chart image itself and is filled in later.

    Raises ValueError if the filename is not ``NNN_Stem.jpg``. Trimming with a
    bare ``removesuffix`` instead would fail open - '001_Albion.JPG' would yield
    the label 'Albion.JPG' and the extension would ship as part of the name.
    """
    m = _FILENAME_RE.match(source_filename)
    if m is None:
        raise ValueError(f"not a NNN_Stem.jpg chart filename: {source_filename!r}")
    return re.sub(r"(?<=[a-z])(?=[A-Z])", " ", m.group(2)).strip()


def anchors_to_localities(
    anchors: dict[int, tuple[float, float]], gcp_tif: str, names: dict[int, str]
) -> list[dict]:
    """Transform SOURCE-image pixel anchors to geographic locality rows.

    Anchors are digitized on the source raster, not the warped one, so the whole
    pipeline works in a single coordinate system. Mixing the two is what
    produced a 27-124 km error earlier in this project.

    Requires anchors and charts to correspond exactly, and raises KeyError
    otherwise. A stray anchor means the digitization is wrong; a chart with no
    anchor means a locality would go missing, and returning a short list is
    exactly the silent partial result this project forbids.
    """
    ids = sorted(anchors)
    unknown = [i for i in ids if i not in names]
    if unknown:
        raise KeyError(f"anchors with no chart entry: {unknown}")
    unanchored = sorted(i for i in names if i not in anchors)
    if unanchored:
        raise KeyError(f"charts with no anchor: {unanchored}")

    coords = georef.source_pixel_to_lonlat(gcp_tif, [anchors[i] for i in ids])
    rows = []
    for chart_id, (lon, lat) in zip(ids, coords):
        fn = names[chart_id]
        rows.append(
            {
                "chart_id": chart_id,
                "index_label": index_label(fn),
                "source_filename": fn,
                "longitude": lon,
                "latitude": lat,
            }
        )
    return rows
