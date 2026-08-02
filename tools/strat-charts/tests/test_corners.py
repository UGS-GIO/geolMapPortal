import json
from pathlib import Path

import numpy as np
import pytest
from strat_charts import corners

DATA = Path(__file__).resolve().parents[1] / "data"


def _synthetic_corner(cx: float, cy: float, size: int = 200) -> np.ndarray:
    """White field with two dark lines crossing at (cx, cy)."""
    img = np.full((size, size), 255.0)
    for y in range(size):
        for x in range(size):
            if abs(x - cx) < 1.2 and y >= cy:
                img[y, x] = 20.0
            if abs(y - cy) < 1.2 and x >= cx:
                img[y, x] = 20.0
    return img


def test_refine_recovers_synthetic_corner():
    gray = _synthetic_corner(101.4, 98.6)
    x, y = corners.refine_corner(gray, (105, 95), window=40)
    assert abs(x - 101.4) < 1.5
    assert abs(y - 98.6) < 1.5


def test_refine_rejects_blank_window():
    """A window with no dark pixels cannot yield a corner - it must raise."""
    gray = np.full((200, 200), 255.0)
    with pytest.raises(ValueError, match="no boundary pixels"):
        corners.refine_corner(gray, (100, 100), window=40)


def test_seed_file_has_all_six_corners():
    seeds = json.loads((DATA / "corner_seeds.json").read_text())["seeds"]
    assert set(seeds) == {"nw", "n_notch", "notch_inner", "ne", "se", "sw"}
    for name, (x, y) in seeds.items():
        assert x > 0 and y > 0, f"{name} seed was never filled in"
