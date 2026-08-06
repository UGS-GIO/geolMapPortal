"""Detect the table grid of a stratigraphic chart.

The row rules are the independent ground truth for "did a unit get dropped".
They are read from the thickness column, which is the one column that is always
a single plain cell per row - the period column spans many rows and the unit
column nests members inside formations, so neither gives a clean row count.
"""
import numpy as np
from PIL import Image

DARK = 130

def _runs(idx, gap=3):
    if not len(idx): return []
    out, cur = [], [idx[0]]
    for i in idx[1:]:
        if i - cur[-1] <= gap: cur.append(i)
        else: out.append(int(np.mean(cur))); cur = [i]
    out.append(int(np.mean(cur)))
    return out

def detect(path):
    a = np.asarray(Image.open(path).convert("L"), dtype=float)
    h, w = a.shape
    dark = a < DARK
    # vertical rules: columns dark down most of the table
    colfrac = dark[int(h*0.05):int(h*0.93), :].mean(axis=0)
    vcols = _runs([j for j in range(w) if colfrac[j] > 0.80])
    bands = [(vcols[i], vcols[i+1]) for i in range(len(vcols)-1)]
    # thickness column: an interior band, right of the period column, modest width
    cand = [b for b in bands if b[0] > w*0.15 and 40 < b[1]-b[0] < w*0.30]
    thick = min(cand, key=lambda b: b[1]-b[0]) if cand else (int(w*0.40), int(w*0.55))
    lo, hi = thick[0]+4, thick[1]-4
    rf = dark[:, lo:hi].mean(axis=1)
    rows = _runs([i for i in range(h) if rf[i] > 0.9])
    rows = [y for y in rows if 40 < y < h*0.975]
    return dict(size=(w,h), vrules=vcols, thickness_band=thick,
                rowlines=rows, n_rows=max(0, len(rows)-1))

if __name__ == "__main__":
    import sys, json, os
    src = os.path.expanduser("~/Documents/temp_data/drive-download-20260801T222738Z-1-001")
    for fn in sys.argv[1:]:
        d = detect(os.path.join(src, fn))
        print(f"{fn:26s} {d['size'][0]}x{d['size'][1]}  vrules={d['vrules']}  "
              f"thick={d['thickness_band']}  rows={d['n_rows']}")
