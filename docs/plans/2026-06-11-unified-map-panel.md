# Unified Map Panel (Layers ⇄ Identify) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge the standalone `#layersPanel` and the click readout (`#unitsPane`) into one bottom-right panel with a **Layers ⇄ Identify** tab bar in the readout's Refined-Light language, remembering its state across visits.

**Architecture:** Reuse `#unitsPane` as the container; add a tab bar; **relocate the `#layersPanel` element inside it (keeping its id + inputs)** and restyle its checkboxes as switches; switch which pane shows by tab. Split the #155 footprints control into a survey toggle (Layers) + an Extent toggle (Identify), reusing the existing footprints plumbing. Persist `{collapsed, tab}` in `localStorage`.

**Tech Stack:** Vanilla JS (ArcGIS Maps SDK + jQuery), plain HTML/CSS. **No build, no test runner.** Verification per task = `node --check public/mapcontrols.js` + CSS brace-balance + `rg` + manual on the PR preview. Do NOT add tests/tooling.

**Spec:** `docs/specs/2026-06-11-unified-map-panel-design.md`

**Branch:** cut from `feat/remove-map-downloads-mode` (PR #155). Read cited regions before editing; match by quoted code, not line numbers.

**Key existing anchors:**
- `index.html:414-417` — `<div id="unitsPane" class="geo-units theme-color hidden"><a id="fms-close" class="close"></a><div id="udTab"></div><div id="dlTab"></div></div>`
- `index.html:260-309` — `<div id="layersPanel" class="theme-color hidden">` … checkboxes `#500k #100k #24k`, the `.footprints-control`, `#reference #2500k`.
- `mapcontrols.js`: `setFootprintMode` (~723), `$(document).on('click','.fp-seg-btn'…)` (~746), `highlightActiveMap` (~763), `$("#layers-button").click` (~1366), `$("#layers-close").click` (~1371), `$("#fms-close").click` (~1463), the readout primary head string (~2058).
- `style.css`: `#unitsPane` (~1295), `.layer-switch*` switch style (~2015-2023), `#layersPanel` (~585).

---

## Task 1: Unified shell — tab bar, relocate `#layersPanel`, repoint open/close

**Files:** `public/index.html`, `public/mapcontrols.js`, `public/style.css`

- [ ] **Step 1: Move `#layersPanel` inside `#unitsPane` and add the tab bar.** In `index.html`, cut the entire `<div id="layersPanel" …>…</div>` block (260-309) from its current spot and paste it INSIDE `#unitsPane`, and add a tab bar, so `#unitsPane` becomes:

```html
        <div id="unitsPane" class="geo-units theme-color hidden">
            <a id="fms-close" class="close" data-title="Close"></a>
            <div id="panelTabs" class="panel-tabs" role="tablist">
                <button type="button" class="panel-tab" data-tab="layers">Layers</button>
                <button type="button" class="panel-tab selected" data-tab="identify">Identify</button>
            </div>
            <div id="layersPanel" class="theme-color">
                <!-- existing #layersPanel inner markup, UNCHANGED for now (restyled in Task 2) -->
            </div>
            <div id="udTab"> </div>
            <div id="dlTab"> </div>
        </div>
```
Remove the `hidden` class from `#layersPanel` (its visibility is now driven by the tab, not that class). Leave its inner checkboxes/`.footprints-control` exactly as-is (Tasks 2 & 4 handle them).

- [ ] **Step 2: Add the tab state + switcher.** In `mapcontrols.js`, near the footprints state (search `var footprintMode`), add:

```js
var panelTab = 'identify';   // which pane shows in the unified panel: 'layers' | 'identify'
function setPanelTab(tab) {
    panelTab = tab;
    document.querySelectorAll('#panelTabs .panel-tab').forEach(function (b) {
        b.classList.toggle('selected', b.dataset.tab === tab);
    });
    byId('layersPanel').style.display = (tab === 'layers') ? 'block' : 'none';
    byId('udTab').style.display       = (tab === 'identify') ? 'block' : 'none';
    byId('dlTab').style.display       = (tab === 'identify') ? '' : 'none';
    if (typeof savePanelState === 'function') savePanelState();   // defined in Task 3
}
function openPanel(tab) { $("#unitsPane").removeClass("hidden"); setPanelTab(tab); }
$(document).on('click', '#panelTabs .panel-tab', function () { setPanelTab(this.dataset.tab); });
```

- [ ] **Step 3: Repoint the Layers button to open the panel on the Layers tab.** Replace the `$("#layers-button").click` handler (1366-1369) with:

```js
$("#layers-button").click(function () {
    if (panelTab === 'layers' && !$("#unitsPane").hasClass("hidden")) {
        $("#unitsPane").addClass("hidden");                 // toggle closed if already showing Layers
        if (typeof savePanelState === 'function') savePanelState();
    } else {
        openPanel('layers');
    }
    $("#layers-button").toggleClass("rightbarExpanded", !$("#unitsPane").hasClass("hidden"));
});
```
Delete the `$("#layers-close").click` handler (1371-1376) — `#layers-close` is removed in Task 2.

- [ ] **Step 4: Make a map click open the Identify tab.** In `fetchAttributes` (search `function fetchAttributes`), at the top after `lastUnitClick = evt;`, add `openPanel('identify');`. Then anywhere the click path currently does `$("#unitsPane").removeClass("hidden")` (the `view.on("click")` units branch and `queryUnits`), it can stay — `openPanel('identify')` is idempotent. Also in the search reroute (`search-complete`), replace its `$("#unitsPane").removeClass("hidden")` with `openPanel('identify');`.

- [ ] **Step 5: Collapse on close.** The `$("#fms-close").click` handler (1463) already hides `#unitsPane` + clears the highlight; add `if (typeof savePanelState === 'function') savePanelState();` as its last line.

- [ ] **Step 6: CSS — tab bar + render `#layersPanel` inline.** In `style.css`, add (near `#unitsPane`, ~1295):

```css
.panel-tabs { display: flex; flex: none; border-bottom: 1px solid #ededed; margin: -2px 0 8px; }
.panel-tab { flex: 1; font-family: "Bebas Neue Regular", Verdana, sans-serif; font-size: 15px; letter-spacing: .4px; padding: 7px 0; background: #f7f9fc; color: #7a8794; border: none; cursor: pointer; position: relative; }
.panel-tab.selected { background: #fff; color: #235c87; }
.panel-tab.selected::after { content: ""; position: absolute; left: 50%; transform: translateX(-50%); bottom: -1px; width: 44px; height: 2px; background: #326A98; border-radius: 2px; }
/* #layersPanel now lives INSIDE #unitsPane: drop its absolute positioning so it flows as a pane */
#unitsPane #layersPanel { position: static; top: auto; right: auto; width: auto; z-index: auto; padding: 0 2px; overflow-y: auto; }
```
Also change the standalone `#layersPanel` rule (~585) so it no longer fixes the old position (the `#unitsPane #layersPanel` override above wins by specificity, but remove the old `position:absolute; top:182px; right:54px;` to avoid confusion — leave the rest for Task 2 to clean).

- [ ] **Step 7: Verify.**
```bash
node --check public/mapcontrols.js
node -e "const s=require('fs').readFileSync('public/style.css','utf8');const o=(s.match(/{/g)||[]).length,c=(s.match(/}/g)||[]).length;console.log(o===c?'BALANCED':'MISMATCH '+o+'/'+c)"
```
Manual (preview): click a map → panel opens on Identify (readout as before); the Layers button opens it on Layers (showing the still-old-styled checkboxes inline); tabs switch panes; close hides the whole panel.

- [ ] **Step 8: Commit.**
```bash
git add public/index.html public/mapcontrols.js public/style.css
git commit -m "feat(panel): unify layers + readout into one tabbed bottom-right panel"
```

---

## Task 2: Restyle the Layers tab as Refined-Light switches

**Files:** `public/index.html`, `public/style.css`

- [ ] **Step 1: Group labels + drop old chrome.** In the relocated `#layersPanel` markup, delete `<p class="layer-panel-title …>Map Layers</p>` and `<a id="layers-close" …></a>`. Add a group label before the `#500k` row and before `#reference`:
```html
            <div class="lyr-group">Geology</div>
            <!-- #500k, #100k, #24k rows -->
            <!-- (footprints-control stays here for now; Task 4 replaces it) -->
            <div class="lyr-group">Base &amp; reference</div>
            <!-- #reference, #2500k rows -->
```

- [ ] **Step 2: Switch-style the checkboxes (CSS-only; inputs unchanged).** In `style.css`, add:
```css
.lyr-group { font-size: 10px; font-weight: 700; letter-spacing: .9px; text-transform: uppercase; color: #9aa0a6; margin: 12px 0 6px; }
#unitsPane #layersPanel .map-layer { margin: 0; }
#unitsPane #layersPanel .map-layer label { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-family: "Avenir Next W00","Helvetica Neue",Arial,sans-serif; font-size: 13px; color: #2f2f2f; padding: 6px 2px; cursor: pointer; }
#unitsPane #layersPanel .list_item { position: absolute; opacity: 0; width: 1px; height: 1px; }   /* hide native checkbox */
#unitsPane #layersPanel .list_item + label::after { content: ""; flex: none; width: 30px; height: 17px; border-radius: 9px; background: #c6c6c6; box-shadow: inset 0 0 0 1px rgba(0,0,0,.04); transition: background .15s ease; position: relative; }
#unitsPane #layersPanel .list_item + label::before { content: ""; position: absolute; right: 4px; width: 13px; height: 13px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.3); transform: translateX(-13px); transition: transform .15s ease; z-index: 1; }
#unitsPane #layersPanel .list_item:checked + label::after { background: #6396fc; }
#unitsPane #layersPanel .list_item:checked + label::before { transform: translateX(0); }
#unitsPane #layersPanel .list_item:focus-visible + label::after { outline: 2px solid #6396fc; outline-offset: 2px; }
```
(The `::before` knob is positioned against the label's right edge; the `&nbsp;` in each label is harmless. If the knob alignment needs nudging, tune `right`/`translateX` against the preview.)

- [ ] **Step 3: Strip the old dark panel look.** In the standalone `#layersPanel` rule (~585) remove the dark/archaic declarations (`color:#ccc`, `font-family: Bebas…`, `font-size:20px`, the paddings) — the panel now inherits the readout's white Refined-Light context. Keep nothing that fights the new styles.

- [ ] **Step 4: Verify.**
```bash
node -e "const s=require('fs').readFileSync('public/style.css','utf8');const o=(s.match(/{/g)||[]).length,c=(s.match(/}/g)||[]).length;console.log(o===c?'BALANCED':'MISMATCH '+o+'/'+c)"
```
Manual: the Layers tab reads as white Refined-Light rows with toggle switches; toggling a switch still turns the geology/reference layer on/off (the underlying checkbox + `change` handler are unchanged); the readout's per-map toggle still flips the matching switch.

- [ ] **Step 5: Commit.**
```bash
git add public/index.html public/style.css
git commit -m "feat(panel): restyle the Layers tab as Refined-Light switches"
```

---

## Task 3: Persist panel state (first-load collapsed, then remembered)

**Files:** `public/mapcontrols.js`

- [ ] **Step 1: Add save/restore.** Near `setPanelTab` (Task 1), add:
```js
var PANEL_STATE_KEY = 'ugsMapPanel';
function savePanelState() {
    try {
        localStorage.setItem(PANEL_STATE_KEY, JSON.stringify({
            collapsed: $("#unitsPane").hasClass("hidden"),
            tab: panelTab
        }));
    } catch (e) { /* storage unavailable (private mode) -- ignore */ }
}
function restorePanelState() {
    var s = null;
    try { s = JSON.parse(localStorage.getItem(PANEL_STATE_KEY)); } catch (e) { s = null; }
    if (!s) { $("#unitsPane").addClass("hidden"); setPanelTab('identify'); return; }   // first-ever load: collapsed
    setPanelTab(s.tab === 'layers' ? 'layers' : 'identify');
    if (s.collapsed) $("#unitsPane").addClass("hidden"); else $("#unitsPane").removeClass("hidden");
}
```

- [ ] **Step 2: Call restore on load.** Find where the app finishes initial setup (search for the existing `setLayerVisibility( uri.layers…` call near the bottom, ~3035, or the view `.when(...)` ready block) and add `restorePanelState();` after the UI is wired. If the Identify tab has no content yet on load, that's fine — Task 5 adds its empty state.

- [ ] **Step 3: Verify.**
```bash
node --check public/mapcontrols.js
```
Manual: first load (clear `localStorage`) → panel collapsed. Open Layers, reload → restored open on Layers. Click a map (Identify), reload → restored open on Identify. Close, reload → stays collapsed.

- [ ] **Step 4: Commit.**
```bash
git add public/mapcontrols.js
git commit -m "feat(panel): remember panel open/collapsed + active tab across visits"
```

---

## Task 4: Footprints split — survey toggle (Layers) + Extent toggle (Identify)

**Files:** `public/index.html`, `public/mapcontrols.js`, `public/style.css`

- [ ] **Step 1: Replace the segmented control markup.** In the Layers tab, replace the whole `.footprints-control` block (the `.fp-seg` Off/This-map/All + `#fpScale`) with a survey switch + the scale row:
```html
            <div class="map-layer" id="fpSurveyRow">
                <input type="checkbox" class="list_item fp-survey" id="fpSurvey" />
                <label for="fpSurvey">Map footprints</label>
            </div>
            <div id="fpScale" class="fp-scale" hidden>
                <button type="button" class="scale-btn selected" data-expr="1=1">All</button>
                <button type="button" class="scale-btn" data-expr="geomaps_service = 'geomaps_1x2'">250K</button>
                <button type="button" class="scale-btn" data-expr="servName = '30x60_Quads'">Interm</button>
                <button type="button" class="scale-btn" data-expr="geomaps_service = 'geomaps_24k'">24K</button>
                <button type="button" class="scale-btn" data-expr="geomaps_service = 'geomaps_irreg'">Other</button>
            </div>
```
(`#fpSurvey` reuses `.list_item` so it gets the switch styling from Task 2. It must NOT be wired into `setLayerVisibility`'s layer loop — see Step 4.)

- [ ] **Step 2: Add the Extent toggle to the readout head.** In `buildAccordion`, change the primary head string (~2058) to include an Extent toggle after the title:
```js
                '<div class="readout-primary-head"><div class="readout-primary-title">' + title + '</div>' +
                    '<label class="extent-toggle" title="Outline this map sheet on the map"><input type="checkbox" class="extent-cb"' + (footprintExtentOn ? ' checked' : '') + '><span class="extent-slider"></span><span class="extent-label">Extent</span></label>' +
                    pill + toggle + '</div>' +
```

- [ ] **Step 3: Replace `setFootprintMode` with two booleans.** Delete `var footprintMode`, `function setFootprintMode`, and the `$(document).on('click', '.fp-seg-btn'…)` handler (723-746). Add:
```js
var footprintSurveyOn = false;   // Layers tab: show all footprints (+ scale filter)
var footprintExtentOn = false;   // Identify: outline the active sheet

// survey toggle (Layers tab)
$(document).on('change', '#fpSurvey', function () {
    footprintSurveyOn = this.checked;
    var lyr = map.findLayerById('footprints');
    byId('fpScale').hidden = !footprintSurveyOn;
    if (footprintSurveyOn) { if (lyr) { lyr.visible = true; lyr.definitionExpression = footprintScaleExpr; } }
    else {
        if (lyr) lyr.visible = false;
        footprintScaleExpr = "1=1";
        document.querySelectorAll('#fpScale .scale-btn').forEach(function (b) { b.classList.remove('selected'); });
        var allBtn = document.querySelector('#fpScale .scale-btn[data-expr="1=1"]');
        if (allBtn) allBtn.classList.add('selected');
    }
});
// extent toggle (Identify head; delegated so it survives readout rebuilds)
$(document).on('change', '.extent-cb', function () {
    footprintExtentOn = this.checked;
    highlightActiveMap(currentActiveFtr());
});
```
Keep the existing `$(document).on('click', '#fpScale .scale-btn'…)` handler (it sets `footprintScaleExpr` + the layer expression) as-is.

- [ ] **Step 4: Point `highlightActiveMap` at the extent flag, and exclude `#fpSurvey` from the layer loop.** In `highlightActiveMap` (search `function highlightActiveMap`), change the guard `if (footprintMode !== 'thismap' || …)` to `if (!footprintExtentOn || !ftr || !ftr.geometry) return;`. Then ensure the `#fpSurvey` checkbox is not treated as a map layer: in `setLayerVisibility` and the `$("#layersPanel").change` handler, confirm they key off layer ids (`500k/100k/24k/reference/2500k`) — if they blanket-iterate `.list_item`, add `:not(.fp-survey)` to those selectors so `#fpSurvey` is skipped.

- [ ] **Step 5: CSS for the Extent toggle.** In `style.css` add a compact switch mirroring `.layer-switch`:
```css
.extent-toggle { flex: none; display: inline-flex; align-items: center; gap: 5px; cursor: pointer; font-size: 11px; color: #326A98; user-select: none; }
.extent-toggle input { position: absolute; opacity: 0; width: 1px; height: 1px; }
.extent-slider { position: relative; flex: none; width: 26px; height: 15px; background: #c6c6c6; border-radius: 8px; }
.extent-slider::after { content: ""; position: absolute; top: 2px; left: 2px; width: 11px; height: 11px; background: #fff; border-radius: 50%; box-shadow: 0 1px 2px rgba(0,0,0,.3); transition: transform .15s ease; }
.extent-toggle input:checked + .extent-slider { background: #6396fc; }
.extent-toggle input:checked + .extent-slider::after { transform: translateX(11px); }
```

- [ ] **Step 6: Verify.**
```bash
node --check public/mapcontrols.js
node -e "const s=require('fs').readFileSync('public/style.css','utf8');const o=(s.match(/{/g)||[]).length,c=(s.match(/}/g)||[]).length;console.log(o===c?'BALANCED':'MISMATCH '+o+'/'+c)"
rg -n "setFootprintMode|footprintMode\b|fp-seg" public/ || echo "old footprints control gone"
```
Manual: Layers → toggle **Map footprints** on → footprints draw + scale row appears + filters + scopes the click query; off → hidden. Identify → **Extent** on → active sheet outlines, follows sections, reverts on collapse; off → clears. Toggling tabs keeps both states.

- [ ] **Step 7: Commit.**
```bash
git add public/index.html public/mapcontrols.js public/style.css
git commit -m "feat(panel): split footprints into a Layers survey toggle + an Identify extent toggle"
```

---

## Task 5: Identify empty state, mobile, and final sweep

**Files:** `public/mapcontrols.js`, `public/style.css`

- [ ] **Step 1: Identify empty state.** When the panel opens on Identify with no readout yet (e.g., first interaction was the Layers button, or restored open-on-Identify with no click), `#udTab` is empty. In `restorePanelState` (Task 3) and `setPanelTab`, if `tab === 'identify'` and `byId('udTab').innerHTML.trim() === ''`, set it to a hint:
```js
    if (tab === 'identify' && !byId('udTab').innerHTML.trim()) {
        byId('udTab').innerHTML = '<div class="readout-empty">Click the map to identify geology.</div>';
    }
```
Add CSS:
```css
.readout-empty { padding: 22px 8px; text-align: center; color: #8a8f94; font-style: italic; font-size: 13px; }
```
(The next real click replaces `#udTab` via `fetchAttributes`, clearing the hint.)

- [ ] **Step 2: Mobile tab bar.** Confirm the `@media (max-width: 767px)` `#unitsPane` rule (~1320) still works with the tab bar (the tabs are `flex: none` at the top; `#udTab`/`#layersPanel` scroll below). If the panel is too short for the Layers list on mobile, add under that media query:
```css
@media (max-width: 767px) {
    #unitsPane #layersPanel { max-height: 50vh; }
}
```

- [ ] **Step 3: Dead-ref + syntax sweep.**
```bash
node --check public/mapcontrols.js
node -e "const s=require('fs').readFileSync('public/style.css','utf8');const o=(s.match(/{/g)||[]).length,c=(s.match(/}/g)||[]).length;console.log(o===c?'BALANCED':'MISMATCH '+o+'/'+c)"
rg -n "setFootprintMode|footprintMode\b|fp-seg-btn|layers-close|layer-panel-title" public/ || echo "clean"
```
The final `rg` should print `clean` (allowing matches only inside `public/images/` archive). Fix any straggler.

- [ ] **Step 4: Push + verify on preview** (manual checklist from the spec's Testing section): first-load collapsed + remembered; click→Identify; Layers button→Layers; geology/reference switches toggle layers and sync with the readout's per-map toggles; survey + Extent toggles; mobile bottom sheet; no console errors.

- [ ] **Step 5: Commit any sweep fixes.**
```bash
git add -A && git commit -m "fix(panel): empty-state hint, mobile tabs, and cleanup sweep"
```

---

## Self-review (author checklist — done)

- **Spec coverage:** unified panel + tab bar → Task 1. Relocate+restyle `#layersPanel` → Tasks 1-2. Footprints split → Task 4. State persistence → Task 3. Empty state/mobile → Task 5. Identify unchanged (only the head gains the Extent toggle, Task 4 Step 2). Reference stays in Layers (Task 2). Opacity untouched.
- **Placeholders:** none — each code step shows real code or an exact command.
- **Identifier consistency:** `panelTab`/`setPanelTab`/`openPanel`/`savePanelState`/`restorePanelState` (Tasks 1,3); `footprintSurveyOn`/`footprintExtentOn` replace `footprintMode`/`setFootprintMode` consistently (Task 4) and `highlightActiveMap` is updated to read `footprintExtentOn`; `footprintScaleExpr` + the `#fpScale` handler are reused.
- **Watch-items carried:** keep `#layersPanel` id + inputs (relocate, don't rebuild); re-anchor `$("#layersPanel").after(dialogNd)` if it breaks (check during Task 1); exclude `#fpSurvey` from the layer-visibility loop (Task 4 Step 4).
- **Order safety:** structural shell first (Task 1), then restyle/persist/footprints, then sweep — the app stays usable each commit.
