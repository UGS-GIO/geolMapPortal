# Unit Description Source Gating Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a clicked unit's description only when its map's descriptions came from the published GIS database; otherwise keep the unit identity line and link to the publication PDF + DOI.

**Architecture:** A per-map boolean `show_unit_desc` is added to the AGOL footprints layer (read for free from the footprint feature `atts` already in hand at click time). `getUnitAttributes` branches on it: truthy → existing description rendering; otherwise → identity line + a side-effect-free `pub_url` fetch + derived DOI link. Default-hide: anything not explicitly true hides.

**Tech Stack:** Vanilla JS (ArcGIS Maps SDK), Firebase Hosting + Cloud Functions (`getData` → MySQL `UGSpubs`), pg_featureserv (PostGIS), AGOL hosted feature layer view.

**Testing note:** This repo has no frontend test runner (`npm test` is a no-op) and `public/mapcontrols.js` is a ~3000-line browser script. Introducing a JS test harness is out of scope for this change; verification is manual in the browser, with exact click steps and expected output below. The decision logic is small and the steps cover both branches plus degradation.

---

## File structure

- `public/mapcontrols.js` — all code changes (outFields, `getUnitAttributes` branch, two small helpers). One file; follows the existing single-file pattern.
- `docs/plans/backfill-show-unit-desc.md` — generated artifact: the 60 `series_id`s to flag + any CSV↔footprints `series_id` mismatches. Consumed by the AGOL backfill, not by code.
- AGOL `Geologic_Map_Footprints_View` (external) — new `show_unit_desc` field + backfill. Performed by UGS; documented here, not executed from this repo.

---

### Task 1: Generate the backfill artifact and reconcile series_ids

**Files:**
- Create: `docs/plans/backfill-show-unit-desc.md`
- Read: `geolmap_portal_delineation.csv`

- [ ] **Step 1: Extract the 60 "show" series_ids from the CSV**

Run:
```bash
cd /Users/marshallrobinson/Documents/git_projects/geolMapPortal
python3 - <<'PY'
import csv
rows=list(csv.DictReader(open('geolmap_portal_delineation.csv')))
show=[r['Series ID'].strip() for r in rows if r['Unit Description Source'].strip()=='Published GIS Database']
print(len(show),"show maps")
print("\n".join(sorted(show)))
PY
```
Expected: `60 show maps` followed by 60 series_ids.

- [ ] **Step 2: Pull the live footprints series_ids and diff against the CSV**

Run:
```bash
curl -s --max-time 30 "https://services.arcgis.com/ZzrwjTRez6FJiOq4/arcgis/rest/services/Geologic_Map_Footprints_View/FeatureServer/0/query?where=1%3D1&outFields=series_id&returnGeometry=false&returnDistinctValues=true&f=json" \
| python3 -c "import sys,json; d=json.load(sys.stdin); print('\n'.join(sorted({f['attributes']['series_id'] for f in d.get('features',[]) if f['attributes'].get('series_id')})))" > /tmp/fp_ids.txt
wc -l /tmp/fp_ids.txt
```
Expected: a list of footprint series_ids written to `/tmp/fp_ids.txt`. Then compare: every one of the 60 "show" CSV ids should exist in `/tmp/fp_ids.txt`. List any that do not (these need spelling reconciliation, e.g. case like `M-302dm` vs `M-302DM`, or `BYU_SA-6564_Vernal_NW`).

- [ ] **Step 3: Write the artifact**

Create `docs/plans/backfill-show-unit-desc.md` containing: (a) the 60 series_ids to set `show_unit_desc = true`, and (b) a "Reconcile" section listing any of the 60 not found verbatim in the footprints layer, with the closest footprint match. This is the checklist UGS uses to field-calculate the layer.

- [ ] **Step 4: Commit**

```bash
git add docs/plans/backfill-show-unit-desc.md
git commit -m "docs: add show_unit_desc backfill list and series_id reconciliation"
```

---

### Task 2: AGOL field + backfill (UGS-side prerequisite — not executed from this repo)

**Files:** AGOL `Geologic_Map_Footprints_View` source layer.

This is a deploy prerequisite. Because the code defaults to hide, it is safe for the code to ship after this is done; if the code shipped first, all descriptions would hide until the field is populated.

- [ ] **Step 1:** Add a Boolean field `show_unit_desc` to the source hosted feature layer (the view inherits it). If the org's layer schema does not support a true Boolean, use a String field matching the existing `units` convention (`'True'`/`'False'`) — the code in Task 3 accepts boolean, integer, or `'True'`.
- [ ] **Step 2:** Set `show_unit_desc = true` for the 60 `series_id`s in `docs/plans/backfill-show-unit-desc.md` (field calculate or apply-edits). Leave all others unset.
- [ ] **Step 3:** Confirm the field is exposed by the view and returns in a query, e.g. open in a browser:
  `https://services.arcgis.com/ZzrwjTRez6FJiOq4/arcgis/rest/services/Geologic_Map_Footprints_View/FeatureServer/0/query?where=series_id%3D%27M-300DM%27&outFields=series_id,show_unit_desc&f=json`
  Expected: a feature with `show_unit_desc` true for `M-300DM`.

---

### Task 3: Code changes in `public/mapcontrols.js`

**Files:**
- Modify: `public/mapcontrols.js:686` (footprints layer `outFields`)
- Modify: `public/mapcontrols.js:1980` (`queryUnits` query `outFields`)
- Modify: `public/mapcontrols.js:2147-2188` (`getUnitAttributes` branch) + add two helpers

- [ ] **Step 1: Request the new field on the footprints layer definition (`:686`)**

Change:
```js
        outFields: ["quad_name","units","resturl","series_id","scale"],
```
to:
```js
        outFields: ["quad_name","units","resturl","series_id","scale","show_unit_desc"],
```

- [ ] **Step 2: Request the new field in the unit-description query (`:1980`)**

Change:
```js
    query.outFields = ["quad_name","units","resturl","series_id","scale"];
```
to:
```js
    query.outFields = ["quad_name","units","resturl","series_id","scale","show_unit_desc"];
```

- [ ] **Step 3: Branch in `getUnitAttributes` (replace the `.then` callback body, `:2165-2187`)**

Replace the existing `.then((results) => { ... });` body with:
```js
        }).then((results) => {
            var unit = (results && results.data && results.data[0]) ? results.data[0] : null;

            scale = (scale) ? scale : ' ';

            // default-hide: for non-statewide maps, show the description only when the
            // footprint is explicitly flagged as sourced from the published GIS database.
            var showDesc = (atts.show_unit_desc === true || atts.show_unit_desc === 'True' || atts.show_unit_desc === 1);
            if (scale != '500k' && !showDesc) {
                renderHiddenUnit(unit, atts);
                return;
            }

            if (!unit) {
                byId('udTab').innerHTML = "<div>No geologic unit was found at this location.</div>";
                byId("viewDiv").style.cursor = "auto";
                return;
            }

            UnitName = unit.unit_name;
            UnitSymbol = unit.unit_symbol;
            UnitAge = unit.age;
            UnitDescription = unit.unit_description;

            if (scale == '500k') UnitDescription = "Either no detailed mapping exists for this region, or detailed layers are turned off in the layer manager. Only unit symbol and unit name are available for the statewide 1:500,000 map scale.";
            html = '<div>' + '<div class="unit-desc-title">' + UnitSymbol + ':&nbsp' + UnitName + '&nbsp(' + UnitAge + ')</div>' + '<hr>' +
                '<div class="unit-desc-text">' + UnitDescription + '</div>' +
                '<div class="unit-desc-ref">&bull;Unit description source scale: 1:' + scale +
                '<br>&bull;DOI Link: <a target="_blank" href="https://doi.org/10.34191/' +atts.series_id+ '">https://doi.org/10.34191/' +atts.series_id+ '</a>' +
                '<br>&bull;Unit descriptions shown are derived from the most detailed geologic map <i>visible</i> on screen where unit descriptions are available.' +
                '&nbsp;Unit description from ' +atts.quad_name+'</div>' + '</div>';
            byId('udTab').innerHTML = html;
            byId("viewDiv").style.cursor = "auto";
        });
```

(The only changes to the show path are the `unit` null-guard — which replaces a latent crash when pg_featureserv returns no row with a readable message — and the gating branch above it. The description HTML is byte-for-byte the original.)

- [ ] **Step 4: Add the two helpers immediately after `getUnitAttributes` (after `:2188`)**

```js
// fetch just the publication PDF url for one map, with no render side effects
// (unlike getData, which renders the downloads panel via printPubs)
function getPubUrl(seriesId) {
    var url = projectName + '/getData?mapid=' + encodeURIComponent(seriesId);
    return fetch(url)
        .then(function (r) { if (!r.ok) throw new Error('getData ' + r.status); return r.json(); })
        .then(function (data) { return (data && data[0] && data[0].pub_url) ? data[0].pub_url : null; });
}

// hidden-description treatment: keep the unit identity line, replace the description
// paragraph with links to the original publication (PDF fetched, DOI derived)
function renderHiddenUnit(unit, atts) {
    var doi = 'https://doi.org/10.34191/' + atts.series_id;
    var title = unit
        ? '<div class="unit-desc-title">' + unit.unit_symbol + ':&nbsp' + unit.unit_name + '&nbsp(' + unit.age + ')</div><hr>'
        : '';
    function paint(pdfUrl) {
        var pdf = pdfUrl
            ? '<a class="pdfDown downloadList" target="_blank" href="' + pdfUrl + '">PDF</a>&nbsp;&middot;&nbsp;'
            : '';
        byId('udTab').innerHTML = '<div>' + title +
            '<div class="unit-desc-text">Unit descriptions for this map are available in the original publication:</div>' +
            '<div class="unit-desc-ref">' + pdf +
            '<a target="_blank" href="' + doi + '">DOI / publication page</a></div></div>';
        byId("viewDiv").style.cursor = "auto";
    }
    paint(null); // show identity + DOI immediately
    getPubUrl(atts.series_id).then(function (u) { if (u) paint(u); }).catch(function () { /* keep DOI-only */ });
}
```

- [ ] **Step 5: Syntax check**

Run:
```bash
node --check public/mapcontrols.js
```
Expected: no output (exit 0). If it errors, fix the edit.

---

### Task 4: Manual verification in the browser

**Files:** none (manual).

- [ ] **Step 1: Serve the site locally**

Run:
```bash
cd /Users/marshallrobinson/Documents/git_projects/geolMapPortal
npx firebase serve --only hosting
```
Expected: hosting served at `http://localhost:5000`. (pg_featureserv, the footprints layer, and `getData` are all called at their prod URLs; `getData` uses `cors({origin:true})`, so localhost works.)

- [ ] **Step 2: Verify the HIDDEN path (works before AGOL backfill — field absent ⇒ default-hide)**

In the browser: enable the "unit descriptions" pane, zoom to a known hide-map area and click a unit. Examples: Moab (`M-180DM`), Beaver (`OFR-454`).
Expected: the panel shows `symbol: name (age)`, the sentence "Unit descriptions for this map are available in the original publication:", and a `PDF · DOI / publication page` line. The PDF link appears within ~1s (after the `getData` fetch); the DOI link is present immediately. No description paragraph.

- [ ] **Step 3: Verify the SHOW path**

If Task 2 (AGOL backfill) is done: click a known show-map (Duchesne `M-300DM`, Blanding North `OFR-771DM`) → the full description renders exactly as before, with the existing DOI/source-scale footer.
If Task 2 is not yet done: temporarily force the branch by editing Step 3's `showDesc` line to `var showDesc = true;`, reload, click any detailed map, confirm the description renders unchanged, then revert the line. (Document that this temporary edit was reverted.)

- [ ] **Step 4: Verify statewide + out-of-state are unchanged**

Turn on only the 1:500,000 statewide layer and click → the existing generic "Only unit symbol and unit name are available…" message shows (not the hidden-links treatment). Click outside Utah → Macrostrat path unchanged.

---

### Task 5: Pre-commit review and commit

**Files:** `public/mapcontrols.js`

- [ ] **Step 1: Review the staged diff**

Per repo convention, run a code-review subagent on the diff (correctness + the frontend behavior: default-hide semantics, the `getPubUrl` no-side-effect requirement, no regression to the show/500k/Macrostrat paths). Address every finding in the same pass.

- [ ] **Step 2: Commit**

```bash
git add public/mapcontrols.js
git commit -m "feat: gate unit descriptions by published-GIS source"
```
Commit body: note the rule (show iff `show_unit_desc` true; default-hide), the AGOL field dependency, and which reviewer(s) ran. No model attribution.

- [ ] **Step 3: Stop before deploy**

Do not deploy hosting until Task 2 (AGOL field + 60-map backfill) is confirmed, or descriptions hide portal-wide. Leave the branch for the user to open a PR / deploy.

---

## Self-review

- **Spec coverage:** rule + encoding (Task 3 Step 3); footprints field + backfill (Tasks 1–2); outFields plumbing (Task 3 Steps 1–2); `getUnitAttributes` branch (Step 3); side-effect-free PDF fetch (Step 4 `getPubUrl`); hidden UI keeps identity + PDF + DOI (Step 4 `renderHiddenUnit`); default-hide (Step 3 `showDesc`); 500k/Macrostrat untouched (Step 3 guard + Task 4 Step 4); null pg result + failed PDF degrade (Step 3 guard, `renderHiddenUnit` catch); rollout sequencing (Task 2 intro, Task 5 Step 3). Covered.
- **Placeholders:** none — all code is concrete.
- **Type consistency:** `show_unit_desc` field name and the tolerant truthy check (`true`/`'True'`/`1`) match across Tasks 2–4; `getPubUrl`/`renderHiddenUnit` names consistent; `unit` shape (`unit_symbol`/`unit_name`/`age`/`unit_description`) matches the pg_featureserv schema.
