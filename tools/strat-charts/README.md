# Stratigraphic chart index tooling

One-off provenance tooling for ALL-5470. Georeferences the index map from
*Geologic History of Utah* (Hintze & Kowallis, 2nd ed., 2021) and produces the
123 locality points published as a Geologic Map Portal layer.

This is kept in the repo so the layer's provenance is findable, not because it
runs in production. Nothing here is deployed — `firebase.json` serves `public/`
only.

## Running

    python3 -m pip install -r requirements.txt
    python3 -m pytest tests/ -v

Source photographs live outside the repo (they are large and not ours to
redistribute); see `strat_charts/orient.py` for the expected paths.

Content use permitted by the BYU Department of Geological Sciences.
