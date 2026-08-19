"""Detect where each strat chart's references block begins (ALL-5470 follow-up).

Every chart in the book prints a full-width horizontal rule under the
stratigraphic column table, with a references/citation paragraph below it.
Review feedback asked for that block to never show in the full-chart viewer
or lightbox - only the column itself is useful there. This script finds
that rule's row per chart and records it as a fraction of image height
(``column_height_frac``) so the viewer can permanently cap the displayed
image there. The source images are never modified - this is display
metadata only.

Detection: scan rows from 50% to 99.5% of image height for a row where more
than 85% of sampled pixels are dark (<100 of 255 gray) - the rule itself. The
LAST such row is the boundary. The 99.5% upper bound (not a flatter 98%)
matters: chart 121's rule sits at 0.986, inside a chart with only one line of
references below it.

Not every chart is a plain formation table, though: chart 70 ("Uinta Basin
Maps") is a map-plus-cross-section figure whose internal panel divider reads
as a full-width dark rule, and there is no references paragraph below it at
all - that would be a false positive with real diagram content (colored
cross-section fill) hidden by default. The fix is a second, independent
signal: a references block is black text on a white background, so the
region below the candidate rule should be almost entirely achromatic. Any
pixel where the RGB channels spread by more than 40 counts as "colorful";
confirmed references blocks measure exactly 0.0 colorful-pixel fraction,
against 0.34 for chart 70's cross-section. A candidate whose below-region
colorful fraction exceeds 2% is discarded as not a references block.

Usage:
    python compute_column_height.py

Reads data/strat_chart_localities.csv, fetches each image_url, and writes the
column_height_frac column back into that CSV and into
public/strat/chart_localities.geojson (matched by chart_id). A chart where no
confident rule is found, or where the region below it fails the
achromatic check, is left blank/null in both files and reported as a
warning - the viewer treats a missing value as "show the full image
uncropped", so a detection miss never hides real content.
"""
import csv
import json
import pathlib
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
CSV_PATH = REPO_ROOT / "tools" / "strat-charts" / "data" / "strat_chart_localities.csv"
GEOJSON_PATH = REPO_ROOT / "public" / "strat" / "chart_localities.geojson"

SEARCH_FROM = 0.5
SEARCH_TO = 0.995
DARK_THRESHOLD = 100
ROW_DARK_FRACTION = 0.85
SAMPLE_STEP = 2
COLOR_SPREAD_THRESHOLD = 40
MAX_COLORFUL_FRACTION = 0.02


def find_column_height_frac(image_path):
    im = Image.open(image_path).convert("RGB")
    arr = np.asarray(im)
    _, h = im.size

    gray = np.asarray(im.convert("L"))[:, ::SAMPLE_STEP]
    dark_frac_per_row = (gray < DARK_THRESHOLD).mean(axis=1)

    lo, hi = int(h * SEARCH_FROM), int(h * SEARCH_TO)
    region = dark_frac_per_row[lo:hi]
    hits = np.nonzero(region > ROW_DARK_FRACTION)[0]
    if hits.size == 0:
        return None
    rule_row = lo + int(hits[-1])

    below = arr[rule_row:h]
    spread = below.max(axis=2).astype(int) - below.min(axis=2).astype(int)
    colorful_fraction = (spread > COLOR_SPREAD_THRESHOLD).mean()
    if colorful_fraction > MAX_COLORFUL_FRACTION:
        return None

    return round(rule_row / h, 4)


def fetch_image(url, dest):
    proc = subprocess.run(
        ["curl", "-sf", "-o", str(dest), url], capture_output=True, text=True, timeout=60
    )
    if proc.returncode != 0:
        raise RuntimeError(f"curl failed: {proc.stderr.strip()}")


def main():
    with open(CSV_PATH, newline="", encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))
    fieldnames = list(rows[0].keys())
    if "column_height_frac" not in fieldnames:
        fieldnames.append("column_height_frac")

    fracs_by_id = {}
    failures = []
    with tempfile.TemporaryDirectory() as tmp:
        for row in rows:
            chart_id = row["chart_id"]
            dest = pathlib.Path(tmp) / f"{chart_id}.jpg"
            try:
                fetch_image(row["image_url"], dest)
                frac = find_column_height_frac(dest)
            except Exception as exc:
                print(f"WARN chart {chart_id}: {exc}", file=sys.stderr)
                frac = None
            if frac is None:
                failures.append(chart_id)
            row["column_height_frac"] = "" if frac is None else frac
            fracs_by_id[chart_id] = frac

    with open(CSV_PATH, "w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    with open(GEOJSON_PATH, encoding="utf-8") as fh:
        fc = json.load(fh)
    for feature in fc["features"]:
        chart_id = str(feature["properties"]["chart_id"])
        feature["properties"]["column_height_frac"] = fracs_by_id.get(chart_id)
    with open(GEOJSON_PATH, "w", encoding="utf-8") as fh:
        # Matches the file's existing single-line, comma-space-separated style
        # (its own prior format, not something this script introduced) - an
        # indented rewrite would turn a one-field addition into a multi-thousand
        # line diff.
        json.dump(fc, fh)

    ok = len(rows) - len(failures)
    print(f"Computed column_height_frac for {ok}/{len(rows)} charts.")
    if failures:
        print(
            f"No confident rule found for chart_id(s): {', '.join(failures)} "
            "- left blank, shown uncropped."
        )


if __name__ == "__main__":
    main()
