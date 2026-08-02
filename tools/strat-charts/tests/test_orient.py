from pathlib import Path
import pytest
from PIL import Image
from strat_charts import orient

OUT = Path(__file__).resolve().parents[1] / "out"


def test_load_oriented_returns_rgb_portrait():
    img = orient.load_oriented(str(OUT / "index_map_a.jpg"))
    assert img.mode == "RGB"
    # The photo carries EXIF orientation 6 (rotate 90 CW): stored 4032x3024,
    # displayed 3024x4032. The page content is portrait.
    assert img.height > img.width, "page content is portrait once EXIF is applied"


def test_orientation_is_actually_applied():
    """The real failure mode is forgetting exif_transpose, not the aspect itself.

    Orientation 6 swaps the axes, so the oriented size must be the stored size
    transposed. If someone drops the transpose, this fails; a bare aspect-ratio
    assertion would not.
    """
    raw = Image.open(str(OUT / "index_map_a.jpg"))
    img = orient.load_oriented(str(OUT / "index_map_a.jpg"))
    assert (img.width, img.height) == (raw.height, raw.width)


def test_write_working_raster_roundtrips_size():
    dst = OUT / "working_a.png"
    w, h = orient.write_working_raster(str(OUT / "index_map_a.jpg"), str(dst))
    assert (w, h) == Image.open(dst).size


def test_missing_source_raises():
    with pytest.raises(FileNotFoundError):
        orient.load_oriented(str(OUT / "does_not_exist.jpg"))
