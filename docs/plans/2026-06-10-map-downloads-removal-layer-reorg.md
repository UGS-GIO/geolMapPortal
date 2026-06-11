# Remove Map Downloads Mode + Footprints Reorg — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retire the Map Downloads mode (tabs + `#mapsPane` swiper + `printPubs`) and rehome footprint browsing into one quiet, three-state "Map footprints" control in the Layers panel, with every click routing to the consolidated readout.

**Architecture:** The `footprints` FeatureLayer (`layers[5]`) is already the shared index of "which maps cover this point." We make the readout the *only* click path, replace the mode-gated footprint visibility/scale-filter with a `setFootprintMode('off'|'thismap'|'all')` control, reroute map-search into the readout, then delete the now-unreferenced mode/swiper code. Order matters: build the replacement first, remove the old mode last, so footprints never break mid-stream.

**Tech Stack:** Vanilla JS (ArcGIS Maps SDK for JavaScript + jQuery), plain HTML/CSS. No build step, no module system, no test runner. **Verification per task = `node --check public/mapcontrols.js` + CSS brace balance + `rg` dead-reference scans + manual checks on the PR preview channel.** There is no automated test suite; do not invent one.

**Spec:** `docs/specs/2026-06-10-map-downloads-removal-layer-reorg-design.md`

**Working files (all under `public/`):** `mapcontrols.js` (~3500 lines, the app logic), `index.html` (markup), `style.css` (styles). Read the cited line ranges before editing — line numbers drift as you edit, so search by the quoted code, not the number.

**Branch:** cut from `feat/readout-redesign` (PR #153, which carries the consolidated readout this depends on). Do NOT start on `master`/`dev`.

---

## Task 1: Route every click to the readout; decouple the scale-filter from "mode"

**Why first:** makes clicking always open the readout (the swiper trigger stops firing) without yet touching any UI, so the app stays usable. Introduces the `footprintScaleExpr` state the new control will own in Task 2.

**Files:**
- Modify: `public/mapcontrols.js` — the `view.on("click", …)` handler (search for `view.on("click", function (evt)`), `queryUnits` (search for `function queryUnits(evt)`), and the `#btn-*` handlers (search for `$("#btn-250k").click`).

- [ ] **Step 1: Add a module-level scale-filter expression.** Near the other top-level state (search for `let mapArray = [];` ~line 49), add:

```js
// current footprint scale-filter expression (set by the "All maps" scale sub-row).
// "1=1" = no filter. Owned by setFootprintMode() in the Layers panel control.
var footprintScaleExpr = "1=1";
```

- [ ] **Step 2: Make the click handler always feed the readout.** In `view.on("click", …)`, the units branch currently only acts in downloads mode. Replace:

```js
                if ($(".map-downloads").hasClass("selected"))  // MAP DOWNLOADS
                {
                    fetchDownloads(ftrset,evt);
                } 
```
with:
```js
                // every click opens the readout, regardless of what footprints are showing
                $("#unitsPane").removeClass("hidden");
                byId('udTab').innerHTML = '<div><img height="14" src="images/loading.gif" alt="loader">&nbsp;fetching unit description...</div>';
                fetchAttributes(ftrset, evt);
```

- [ ] **Step 3: Make `queryUnits` mode-independent.** In `queryUnits`, replace the scale-filter gate:

```js
    if ( $(".map-downloads").hasClass("selected") ) query.where = defExp;  
```
with:
```js
    query.where = footprintScaleExpr;   // scoped only when the user picked a scale under "All maps"
```
and replace the unit-descs gate around `fetchAttributes`:
```js
        if ($(".unit-descs").hasClass("selected"))   // UNIT ATTRIBUTES
        {
            html = '<div><img height="14" src="images/loading.gif" alt="loader">&nbsp;fetching unit description...</div>';
            byId('udTab').innerHTML = html;
            $("#unitsPane").removeClass("hidden");
            fetchAttributes(ftrset,evt);

        } 
```
with (drop the `if`, keep the body):
```js
        html = '<div><img height="14" src="images/loading.gif" alt="loader">&nbsp;fetching unit description...</div>';
        byId('udTab').innerHTML = html;
        $("#unitsPane").removeClass("hidden");
        fetchAttributes(ftrset, evt);
```

- [ ] **Step 4: Keep the legacy scale buttons setting the new state (temporary bridge).** In each `#btn-*` handler (search `$("#btn-250k").click`), after the line that sets `lyr.definitionExpression = "…"`, add a line setting `footprintScaleExpr` to the same string. Example for `#btn-250k`:

```js
    lyr.definitionExpression = "geomaps_service = 'geomaps_1x2'";
    footprintScaleExpr = "geomaps_service = 'geomaps_1x2'";
```
Do the same for `#btn-100k` (`"servName = '30x60_Quads'"`), `#btn-24k` (`"geomaps_service = 'geomaps_24k'"`), `#btn-irreg` (`"geomaps_service = 'geomaps_irreg'"`), and `#btn-all` (`"1=1"`). (These handlers get replaced in Task 2; this keeps the click query correct in between.)

- [ ] **Step 5: Verify.**
```bash
node --check public/mapcontrols.js   # expect: no output (valid)
```
Manual (preview channel, after the branch is pushed): click a unit map → readout opens with units + downloads; click between units → empty-state readout. Switching the (still-present) Map Downloads tab no longer shows the swiper on click.

- [ ] **Step 6: Commit.**
```bash
git add public/mapcontrols.js
git commit -m "refactor(readout): route every map click to the readout; decouple scale-filter from mode"
```

---

## Task 2: Add the "Map footprints" control (Off / All maps) and make it own footprint visibility + scale

**Why:** replaces the disabled `#footprints` checkbox + `#scaleBtns` with the real control and moves footprint visibility off the mode toggles. Implements **Off** and **All maps** here; **This map** is wired in Task 3 (the "This map" button exists but no-ops until then).

**Files:**
- Modify: `public/index.html` — the footprints `map-layer` block (search for `id='footprints'`, ~lines 297–306).
- Modify: `public/mapcontrols.js` — add `setFootprintMode`; remove footprint toggling from `toggleUnitDesc`/`toggleMapDl` (search `function toggleUnitDesc`).
- Modify: `public/style.css` — add control styles.

- [ ] **Step 1: Replace the footprints markup.** Swap the entire `<div class="map-layer">` that contains `id='footprints'` and `id="scaleBtns"` for:

```html
            <div class="map-layer footprints-control">
                <div class="fp-label">Map footprints</div>
                <div class="fp-seg" role="group" aria-label="Map footprints">
                    <button type="button" class="fp-seg-btn selected" data-fp="off">Off</button>
                    <button type="button" class="fp-seg-btn" data-fp="thismap">This map</button>
                    <button type="button" class="fp-seg-btn" data-fp="all">All maps</button>
                </div>
                <div id="fpScale" class="fp-scale" hidden>
                    <button type="button" class="scale-btn selected" data-expr="1=1">All</button>
                    <button type="button" class="scale-btn" data-expr="geomaps_service = 'geomaps_1x2'">250K</button>
                    <button type="button" class="scale-btn" data-expr="servName = '30x60_Quads'">Interm</button>
                    <button type="button" class="scale-btn" data-expr="geomaps_service = 'geomaps_24k'">24K</button>
                    <button type="button" class="scale-btn" data-expr="geomaps_service = 'geomaps_irreg'">Other</button>
                </div>
            </div>
```

- [ ] **Step 2: Add the control logic.** In `mapcontrols.js`, near the footprints layer code, add:

```js
// "Map footprints" panel control: off (hidden) / thismap (active-map outline, Task 3) / all (show layer + scale filter)
var footprintMode = 'off';
function setFootprintMode(mode) {
    footprintMode = mode;
    document.querySelectorAll('.fp-seg-btn').forEach(function (b) {
        b.classList.toggle('selected', b.dataset.fp === mode);
    });
    var lyr = map.findLayerById('footprints');
    byId('fpScale').hidden = (mode !== 'all');
    if (mode === 'all') {
        if (lyr) { lyr.visible = true; lyr.definitionExpression = footprintScaleExpr; }
    } else {
        if (lyr) lyr.visible = false;
        footprintScaleExpr = "1=1";                 // click query unscoped unless surveying
        highlightActiveMap(null);                   // defined in Task 3; clears any outline
    }
    if (mode === 'thismap') highlightActiveMap(currentActiveFtr());   // defined in Task 3
}

// segmented control + scale sub-row wiring
$(document).on('click', '.fp-seg-btn', function () { setFootprintMode(this.dataset.fp); });
$(document).on('click', '#fpScale .scale-btn', function () {
    document.querySelectorAll('#fpScale .scale-btn').forEach(function (b) { b.classList.remove('selected'); });
    this.classList.add('selected');
    footprintScaleExpr = this.dataset.expr;
    var lyr = map.findLayerById('footprints');
    if (lyr) lyr.definitionExpression = footprintScaleExpr;
});
```

Add temporary no-op stubs so this task runs standalone (Task 3 replaces them):
```js
function highlightActiveMap(ftr) {}      // replaced in Task 3
function currentActiveFtr() { return null; }   // replaced in Task 3
```

- [ ] **Step 3: Stop the mode toggles from touching footprints.** In `toggleUnitDesc()` and `toggleMapDl()`, delete every line referencing `footprints` (`map.findLayerById('footprints').visible = …`, the `addFootprints()` call, and the `byId("footprints")…` checkbox lines). The new control is the sole owner now. (These functions are deleted entirely in Task 5; this just prevents them fighting the control until then.)

- [ ] **Step 4: Add styles.** In `style.css`, near the existing `.scale-btn` rules (search `.scale-btn`), add:

```css
.footprints-control { margin-top: 6px; }
.fp-label { font-size: 11px; font-weight: 700; letter-spacing: .4px; text-transform: uppercase; color: #4a4a4a; margin: 4px 0 6px; }
.fp-seg { display: flex; border: 1px solid #cdd8e3; border-radius: 6px; overflow: hidden; }
.fp-seg-btn { flex: 1; font: inherit; font-size: 11.5px; padding: 6px 4px; background: #f7f9fc; color: #4a6b85; border: none; border-right: 1px solid #dde5ec; cursor: pointer; }
.fp-seg-btn:last-child { border-right: none; }
.fp-seg-btn.selected { background: #326A98; color: #fff; font-weight: 700; }
.fp-scale { margin-top: 8px; display: flex; gap: 4px; flex-wrap: wrap; }
.fp-scale[hidden] { display: none; }
```
Keep the existing `.scale-btn` rules (the new scale buttons reuse that class).

- [ ] **Step 5: Verify.**
```bash
node --check public/mapcontrols.js
node -e "const s=require('fs').readFileSync('public/style.css','utf8');const o=(s.match(/{/g)||[]).length,c=(s.match(/}/g)||[]).length;console.log(o===c?'BALANCED':'MISMATCH '+o+'/'+c)"
```
Manual: Off → no footprints. All maps → footprints draw + the scale row appears and filters them (and scopes the click-query to that scale). This map → (no outline yet; Task 3).

- [ ] **Step 6: Commit.**
```bash
git add public/index.html public/mapcontrols.js public/style.css
git commit -m "feat(layers): add the Map footprints control (Off / This map / All maps) with scale sub-filter"
```

---

## Task 3: "This map" — outline just the active readout map

**Files:**
- Modify: `public/mapcontrols.js` — replace the Task 2 stubs (`highlightActiveMap`, `currentActiveFtr`); add a dedicated graphics layer; hook readout section-open and close.

**Context:** `accordionFtrs` (module array, set in `fetchAttributes`) holds the footprint features in section order. The open section is identified by `data-idx` on `.map-section`/`.readout-primary`. `hlOutline` (the symbol used by `highlightMap`) already exists. Use a **dedicated** graphics layer so the outline never clobbers the click marker on `graphicsLayer`.

- [ ] **Step 1: Add a highlight layer + real helpers.** Replace the two stubs from Task 2 with:

```js
// dedicated layer for the "This map" footprint outline (kept off graphicsLayer so it
// never wipes the click marker). hlOutline is the existing highlight symbol.
var fpHighlightLayer = new GraphicsLayer();
map.add(fpHighlightLayer);
var activeFtrIdx = 0;   // index into accordionFtrs of the open section

function currentActiveFtr() {
    return (accordionFtrs && accordionFtrs[activeFtrIdx]) ? accordionFtrs[activeFtrIdx] : null;
}
function highlightActiveMap(ftr) {
    fpHighlightLayer.removeAll();
    if (footprintMode !== 'thismap' || !ftr || !ftr.geometry) return;
    if (parseInt(ftr.attributes.scale) >= 500) return;   // skip statewide (1:500,000) and coarser
    fpHighlightLayer.add(new Graphic({ geometry: ftr.geometry, symbol: hlOutline }));
}
```

- [ ] **Step 2: Track the open section and re-highlight on open.** In `fetchAttributes`, after `byId('udTab').innerHTML = buildAccordion(accordionFtrs, openIdx);`, add:
```js
    activeFtrIdx = openIdx;
    highlightActiveMap(currentActiveFtr());
```
Then find the readout section-open handler (search `$("#unitsPane").on("click", ".map-section-header"`, ~line 1108) and, inside the handler after the section's `data-idx` is known, set `activeFtrIdx` and re-highlight. If the handler exposes the section element as `this`/`sectionEl`, add:
```js
        var _idx = parseInt(this.closest('.map-section').getAttribute('data-idx'));
        if (!isNaN(_idx)) { activeFtrIdx = _idx; highlightActiveMap(currentActiveFtr()); }
```
(Read the handler first; mirror how it currently reads `data-idx`.)

- [ ] **Step 3: Clear on readout close.** In the `#fms-close` click handler (search `$("#fms-close").click`), add `fpHighlightLayer.removeAll();` alongside the existing `$("#unitsPane").addClass("hidden")`.

- [ ] **Step 4: Verify.**
```bash
node --check public/mapcontrols.js
```
Manual: set control to **This map**, click a multi-map location → exactly one outline on the open sheet; open another accordion section → the outline moves to that sheet; click a statewide-only spot → no outline; close the readout → outline clears. Switch to **Off** → outline clears. Switch to **All maps** → full footprints (no single highlight).

- [ ] **Step 5: Commit.**
```bash
git add public/mapcontrols.js
git commit -m "feat(layers): This-map footprint highlight wired to the readout accordion"
```

---

## Task 4: Reroute map-search to the readout (empty-state + "click to identify" prompt)

**Files:**
- Modify: `public/mapcontrols.js` — `searchMaps.on("search-complete", …)` and `"search-clear"` (search `searchMaps.on("search-complete"`); `loadUnitDescription` (search `function loadUnitDescription`).

**Context:** `searchMaps` searches the footprints layer, so `e.results[0].results[*].feature` are footprint features — directly usable by `fetchAttributes`, which needs an `evt.mapPoint`. Synthesize one from the result extent center.

- [ ] **Step 1: Add a search-prompt flag.** Near `footprintScaleExpr` (Task 1), add:
```js
// when true, the next readout sections show a "click to identify" prompt instead of querying a unit
var readoutSearchPrompt = false;
```

- [ ] **Step 2: Rewrite `search-complete`.** Replace the whole handler body (the part that does `$(".map-downloads").addClass("selected")` … `getData(mapidsArr)`) with:
```js
searchMaps.on("search-complete", function (e) {
    var f = e.results;
    var ftrset = $.map(f[0].results, function (item) { return item.feature; });
    if (!ftrset.length) return;
    graphicsLayer.removeAll();
    var ext = ftrset[0].geometry.extent;
    view.goTo(ext.expand ? ext.expand(1.3) : ext);
    var syntheticEvt = { mapPoint: ext.center };     // no clicked point; use the map's center
    readoutSearchPrompt = true;
    $("#unitsPane").removeClass("hidden");
    byId('udTab').innerHTML = '<div><img height="14" src="images/loading.gif" alt="loader">&nbsp;loading map…</div>';
    fetchAttributes(ftrset, syntheticEvt);
    searchMaps.blur();
});
```

- [ ] **Step 3: Tidy `search-clear`.** Replace its body with just:
```js
searchMaps.on("search-clear", function () {
    graphicsLayer.removeAll();
});
```

- [ ] **Step 4: Show the prompt in the readout.** In `loadUnitDescription`, at the very top of the function (before the `esriRequest`), add a short-circuit that renders the prompt + resources when search-driven:
```js
    if (readoutSearchPrompt) {
        bodyEl.innerHTML =
            '<div class="readout-section-body">' +
                '<div class="readout-main"><div class="unit-desc-text readout-identify-hint">Click the map to identify a geologic unit.</div></div>' +
                '<div class="readout-resources"><img height="14" src="images/loading.gif" alt="">&nbsp;loading&#8230;</div>' +
            '</div>';
        fillResources(atts, bodyEl.querySelector('.readout-resources'));
        return;
    }
```
Reset the flag on the next real click: in `view.on("click", …)`, as the first line inside the handler, add `readoutSearchPrompt = false;`. (Leave it `true` for the whole search-built readout so every lazily-opened section shows the hint until the user actually clicks the map. Sections are lazy-loaded, so don't reset it in `fetchAttributes`.)

- [ ] **Step 5: Add a hint style.** In `style.css` (near `.unit-desc-text`), add:
```css
.readout-identify-hint { color: #6b7884; font-style: italic; }
```

- [ ] **Step 6: Verify.**
```bash
node --check public/mapcontrols.js
node -e "const s=require('fs').readFileSync('public/style.css','utf8');const o=(s.match(/{/g)||[]).length,c=(s.match(/}/g)||[]).length;console.log(o===c?'BALANCED':'MISMATCH '+o+'/'+c)"
```
Manual: search a map → it pans/zooms and the readout opens with the "Click the map to identify a geologic unit." hint and the map's downloads/citation; then click the map → a real unit description replaces the hint; `search-clear` removes graphics with no errors.

- [ ] **Step 7: Commit.**
```bash
git add public/mapcontrols.js public/style.css
git commit -m "feat(search): open searched maps in the readout with a click-to-identify prompt"
```

---

## Task 5: Remove the Map Downloads mode UI, the swiper, and the dead code

**Why now:** nothing routes to the carousel anymore (Tasks 1 & 4) and the new control owns footprints (Task 2), so this is pure deletion.

**Files:** `public/index.html`, `public/mapcontrols.js`, `public/style.css`.

- [ ] **Step 1: Remove markup (`index.html`).** Delete:
  - the `#identifyPanel` block (the `.unit-descs` / `.map-downloads` tabs — search `id="identifyPanel"`);
  - the `#mapsPane` block and all its children (search `id="mapsPane"`): `.swiper-container`, `.swiper-wrapper`, `.swiper-button-next/prev`, `#toggleSidebar`, `.dl-close`, `#mapCount`;
  - the Swiper CDN + local includes (search `swiper-bundle`): the two `<link>`/`<script>` pairs.

- [ ] **Step 2: Remove JS (`mapcontrols.js`).** Delete these (search each by name): `$(".identify").click` handler; `$("#identifyPanel a").click` handler; `$(".unit-descs").click` + `$(".map-downloads").click` handlers; `toggleUnitDesc` + `toggleMapDl`; `$("#toggleSidebar").click` + `hideMapsPane` + `showMapsPane`; `$(".dl-close").click`; `fetchDownloads`; `printPubs`; `getVisibleFootprints`; the Swiper instance init (`new Swiper(` … search `Swiper`) and its `mySwiper`/`slideChange`/keyboard references; `combineFtrResults` if only `printPubs` used it; `addFootprints` if only the deleted toggles used it. Then check `getData` and `mapGeometry`:
```bash
rg -n "getData|mapGeometry|highlightMaps|mapArray\b|mapCount|#mapsPane|map-downloads|unit-descs|toggleMapDl|toggleUnitDesc|printPubs|fetchDownloads|mySwiper|Swiper" public/mapcontrols.js public/index.html
```
Remove `getData`, `mapGeometry`, `highlightMaps`, and `mapArray` if the scan shows no remaining readers (the readout uses `getPubData`, not `getData`). Keep anything still referenced; note in the commit what was kept and why.

- [ ] **Step 3: Remove CSS (`style.css`).** Delete `#mapsPane`, `.swiper-*`, `#toggleSidebar`, `.dl-close`, `#mapCount`, and `#identifyPanel` rules, plus the Map-Downloads-only mobile media queries (search `mapsPane` and `swiper`). For the legacy `.pdfIcon/.gisIcon/.tiffIcon/.xsecIcon/.purIcon` rules, first confirm they're now unused:
```bash
rg -n "pdfIcon|gisIcon|tiffIcon|xsecIcon|purIcon" public/
```
Delete them only if `printPubs` was their sole user and the scan is otherwise clean; otherwise keep.

- [ ] **Step 4: Verify.**
```bash
node --check public/mapcontrols.js
node -e "const s=require('fs').readFileSync('public/style.css','utf8');const o=(s.match(/{/g)||[]).length,c=(s.match(/}/g)||[]).length;console.log(o===c?'BALANCED':'MISMATCH '+o+'/'+c)"
rg -n "map-downloads|unit-descs|identifyPanel|mapsPane|Swiper|printPubs|fetchDownloads|toggleMapDl|toggleUnitDesc" public/ || echo "clean"
```
Expect the final `rg` to print `clean` (no stragglers). Manual: full reload — app loads with no console errors; no mode tabs, no swiper; click→readout; footprints control works; search works.

- [ ] **Step 5: Commit.**
```bash
git add public/index.html public/mapcontrols.js public/style.css
git commit -m "refactor(readout): remove the Map Downloads mode, swiper, and dead carousel code"
```

---

## Task 6: Final sweep + preview verification

**Files:** none expected (verification only; small fixes if the sweep finds issues).

- [ ] **Step 1: Dead-reference + syntax sweep.**
```bash
node --check public/mapcontrols.js
node -e "const s=require('fs').readFileSync('public/style.css','utf8');const o=(s.match(/{/g)||[]).length,c=(s.match(/}/g)||[]).length;console.log(o===c?'BALANCED':'MISMATCH '+o+'/'+c)"
rg -n "btn-250k|btn-100k|btn-24k|btn-irreg|btn-all|#scaleBtns|footprints'\).visible" public/   # old scale buttons should be gone from index.html
```

- [ ] **Step 2: Push and verify on the preview channel.** Push the branch; open the PR preview URL and run the full manual checklist from the spec's Testing section:
  - Click M-249 (unit map) → readout with units + downloads; MP-17-2DM (pub-only) → empty-state readout with resources. No mode tabs.
  - Footprints: Off → nothing; This map → one outline on the active sheet, moves on section-open, clears on close, none for statewide; All maps → all footprints + scale filter thins them and scopes the click query.
  - Search a map → pans/zooms + readout with the "click to identify" hint + downloads; then click → real unit.
  - Mobile (bottom sheet): readout opens/closes cleanly; no swiper/dock leftovers; no console errors.

- [ ] **Step 3: (If sweep clean) no commit needed.** If small fixes were required, commit them:
```bash
git add -A && git commit -m "fix(readout): cleanup nits from the Map Downloads removal sweep"
```

---

## Self-review (author checklist — done)

- **Spec coverage:** §1 mode removal → Tasks 1 (routing) + 5 (UI/code). §2 footprints control → Tasks 2 (Off/All) + 3 (This map). §3 search reroute → Task 4. §4 cleanup → Tasks 5 + 6. Preserved/deferred items are untouched (opacity panel, geology scale-dependency).
- **Placeholders:** none — every code step shows real code or an exact `rg`/`node` command with expected output.
- **Identifier consistency:** `footprintScaleExpr` (Task 1) is read in `queryUnits` and set by the scale sub-row (Task 2). `footprintMode`/`setFootprintMode` (Task 2) drive `highlightActiveMap`/`currentActiveFtr` (stubs in Task 2, real in Task 3). `readoutSearchPrompt` (Task 4) is set in search-complete, read in `loadUnitDescription`, reset in the click handler. `fpHighlightLayer` is created once (Task 3). All match across tasks.
- **Watch-items resolved:** `getData` confirmed downloads-only (readout uses `getPubData`); the "This map" outline uses the raw `feature.geometry` + `hlOutline` on a dedicated `fpHighlightLayer` (no `mapGeometry`, no marker clobber); search synthesizes `evt.mapPoint` from the result extent center.
- **Order safety:** replacement (Tasks 1–4) precedes removal (Task 5), so footprints never break mid-implementation.
