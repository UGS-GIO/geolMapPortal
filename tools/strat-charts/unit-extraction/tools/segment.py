"""Cut a chart into row-indexed segments for transcription.

Every row gets its index printed in a left gutter and a rule drawn at its
boundary, so a transcription is anchored to a row number rather than to
position in a list. Row/column drift - the failure mode that silently corrupts
this kind of extraction - becomes impossible rather than merely unlikely.
"""
import os, sys
sys.path.insert(0, '.')
from grid import detect
from PIL import Image, ImageDraw, ImageFont

SRC = os.path.expanduser("~/Documents/temp_data/drive-download-20260801T222738Z-1-001")
GUT = 86          # left gutter width for row numbers
ZOOM = 1.30

def _table_bottom(im, last_rule):
    """Lowest row still carrying coloured (table) pixels, below the last rule.

    The citation footer is black on white, so chroma separates table from
    footer cleanly.
    """
    import numpy as np
    a = np.asarray(im.convert("RGB"), dtype=int)
    h, w, _ = a.shape
    band = a[:, :int(w * 0.60)]
    chroma = (band.max(axis=2) - band.min(axis=2)) > 40
    rows_with_colour = np.nonzero(chroma.mean(axis=1) > 0.02)[0]
    if not len(rows_with_colour):
        return last_rule
    return int(min(h, max(last_rule, rows_with_colour.max() + 8)))


def build(fn, nseg=3, outdir="."):
    d = detect(os.path.join(SRC, fn))
    im = Image.open(os.path.join(SRC, fn)).convert("RGB")
    rows = d["rowlines"]
    canvas = Image.new("RGB", (im.width + GUT, im.height), "white")
    canvas.paste(im, (GUT, 0))
    dr = ImageDraw.Draw(canvas)
    try:    f = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 30)
    except: f = ImageFont.load_default()
    for i in range(len(rows) - 1):
        y0, y1 = rows[i], rows[i+1]
        dr.line([(0, y0), (canvas.width, y0)], fill=(255, 0, 0), width=2)
        dr.text((6, (y0 + y1)//2 - 17), str(i+1), fill=(200, 0, 0), font=f)
    if rows:
        dr.line([(0, rows[-1]), (canvas.width, rows[-1])], fill=(255, 0, 0), width=2)

    # split on row boundaries so no row is ever cut in half
    n = len(rows) - 1
    bounds = [0]
    for s in range(1, nseg):
        bounds.append(rows[round(n * s / nseg)])
    # Extend the final segment past the last detected rule to the bottom of the
    # coloured table region. Ending at rows[-1] silently hid real units on three
    # charts (20, 93, 121) - the grid detector simply missed their last rules.
    bounds.append(_table_bottom(im, rows[-1] if rows else 0))
    paths = []
    for s in range(nseg):
        top = max(0, bounds[s] - (0 if s == 0 else 0))
        seg = canvas.crop((0, top if s else 0, canvas.width, bounds[s+1]))
        seg = seg.resize((int(seg.width*ZOOM), int(seg.height*ZOOM)), Image.LANCZOS)
        p = f"{outdir}/seg_{fn[:3]}_{s+1}.png"
        seg.save(p); paths.append((p, seg.size))
    return d, paths

if __name__ == "__main__":
    for fn in sys.argv[1:]:
        d, ps = build(fn)
        print(f"{fn}: {d['n_rows']} rows -> " + ", ".join(f"{p.split('/')[-1]} {s[0]}x{s[1]}" for p,s in ps))
