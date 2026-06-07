# Consolidated Feature Readout Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fold the Map Downloads card's downloads, citation, and per-map actions into the click readout, with a responsive two-column (desktop) / stacked-with-disclosure (mobile) layout and a single scroll container — vanilla, no new libraries.

**Architecture:** All changes live in `public/mapcontrols.js` + `public/style.css` (the repo's single-file pattern). Add shared helpers (`buildCitation`, `buildPubLink`), a `renderResources()` block injected into each readout section, event-delegated tool handlers, responsive CSS at a 768px breakpoint, and a single-scroll panel with a pinned header (achieved by making `#udTab` the scroller and switching `#unitsPane` show/hide to class-based so a CSS flex layout holds).

**Tech Stack:** Vanilla JS (ArcGIS Maps SDK + jQuery) + CSS; Firebase `getData` + pg_featureserv. No build step.

**Testing note:** This repo has no frontend test runner (`npm test` is a no-op). The readout panel is fully testable on `http://localhost:5000` via `npx firebase serve --only hosting` — the footprints layer (AGOL), pg_featureserv, and `getData` are all public, so clicking the map and exercising the panel works locally. Only the *secured ArcGIS base geology tiles* won't render locally; that does not block testing the panel's content/layout. After every code change run `node --check public/mapcontrols.js`; after CSS changes confirm braces balance (`[ "$(tr -cd '{' < public/style.css | wc -c)" = "$(tr -cd '}' < public/style.css | wc -c)" ]`). Full base-tile fidelity is verified on the dev site after merge.

Spec: `docs/specs/2026-06-06-consolidated-readout-panel-design.md`.

---

## File structure

- **Modify** `public/mapcontrols.js` — `buildCitation`/`buildPubLink` helpers; `renderResources`/`fillResources`; restructure `loadUnitDescription` + `loadPublicationOnly` section bodies; delegated tool/copy/xsection/disclosure handlers; widen `prefetchPubData`; class-based `#unitsPane` show/hide.
- **Modify** `public/style.css` — responsive section grid, resources rail, disclosure groups, download/tool/citation styling (reusing the existing `pdfIcon`/`gisIcon`/`tiffIcon`/`xsecIcon`/`purIcon` glyphs), mobile description truncation, single-scroll panel sizing + bottom sheet, pinned-header flex layout.

No new files (single-file pattern). No `package.json` changes (no new dependency).

Out of scope (separate follow-ups): removing the Map Downloads mode/swiper (`#identifyPanel`, `toggleMapDl`, `#mapsPane`, `printPubs`); the layer-list / scale-button reorg.

---

### Task 1: Shared helpers — `buildCitation` + `buildPubLink`

**Files:** Modify `public/mapcontrols.js`.

- [ ] **Step 1: Add the two helpers** immediately after the `displaySeriesId` function.

```js
// citation string for a publication record (shared by the readout + the downloads carousel).
// pub_sec_author is free text that may already contain "and" + multiple names (e.g.
// "L.F. Hintze, and J.H. Madsen Jr."), so only add "and" when it doesn't already have one.
function buildCitation(rec) {
    if (!rec) return '';
    var authors = rec.pub_author || '';
    if (rec.pub_sec_author) {
        var sec = String(rec.pub_sec_author).trim();
        if (sec) authors += (/\band\b/i.test(sec) ? ', ' : ', and ') + sec;
    }
    var scaleInt = scaleToInt(rec.pub_scale);
    var publisher = rec.pub_publisher ? rec.pub_publisher : '';
    return authors + ', ' + rec.pub_year + ', ' + rec.pub_name + '. ' + rec.series_id + '. ' + publisher + '. 1:' + scaleInt + ',000 scale.';
}

// publisher-aware publication link: UGS/UGMS -> our DOI; other publishers -> the UGS catalog
// page (we host the page but not their DOI, so it must not be labeled a DOI link).
function buildPubLink(seriesId, rec) {
    var pub = (rec && rec.pub_publisher ? rec.pub_publisher : '').trim().toUpperCase();
    var isUgs = (pub === 'UGS' || pub === 'UGMS' || pub.indexOf('UTAH GEOLOGICAL') > -1);
    return isUgs
        ? '<a target="_blank" href="https://doi.org/10.34191/' + seriesId + '">DOI Link</a>'
        : '<a target="_blank" href="https://geology.utah.gov/publication-details/?pub=' + seriesId + '">Publication Page</a>';
}
```

- [ ] **Step 2: Use `buildCitation` in `printPubs`.** Find the citation block in `printPubs` (the `var authors = arr.pub_author; if (arr.pub_sec_author) {…} var reftxt = authors + ', ' + arr.pub_year + …;`) and replace the whole `authors`/`reftxt` computation with:

```js
        var reftxt = buildCitation(arr);
```

(`publisher`/`scaleInt` locals above it stay; only the author-join + `reftxt` lines collapse into the helper call.)

- [ ] **Step 3: Syntax check.** Run: `node --check public/mapcontrols.js` — expect no output (exit 0).

- [ ] **Step 4: Commit.**

```bash
git add public/mapcontrols.js
git commit -m "refactor(readout): extract buildCitation + buildPubLink helpers"
```

---

### Task 2: getData returns the full record + prefetch all footprints

**Files:** Modify `public/mapcontrols.js`.

- [ ] **Step 1: Return the full publication record from `getPubData`.** Today it strips the result to `{ pub_url, geotiff, pub_publisher }`, but the resources block needs `gis_data`, `x_section`, `bsurl`, and the citation fields. In `getPubData`, replace the `.then(function (data) { var rec = …; return rec ? { pub_url:…, geotiff:…, pub_publisher:… } : null; })` with:

```js
        .then(function (data) { return (data && data[0]) ? data[0] : null; });
```

(The full record is a superset of the old shape, so the existing `pub_url`/`geotiff`/`pub_publisher` reads still work. `getPubData` remains memoized by `series_id`.)

- [ ] **Step 2: Widen `prefetchPubData`.** Replace the function body (currently filters `a.units !== 'True'`) with:

```js
function prefetchPubData(ftrs) {
    for (var i = 0; i < ftrs.length; i++) {
        var sid = ftrs[i].attributes.series_id;
        if (sid) getPubData(sid).catch(function () {});
    }
}
```

(Every section now shows downloads/citation, so warm the cache for all maps at the point.)

- [ ] **Step 3: Syntax check.** Run: `node --check public/mapcontrols.js` — exit 0.

- [ ] **Step 4: Commit.**

```bash
git add public/mapcontrols.js
git commit -m "perf(readout): return full pub record + prefetch all footprints at the point"
```

---

### Task 3: Resources renderer + wire into both section paths

**Files:** Modify `public/mapcontrols.js`.

- [ ] **Step 1: Add `renderResources` + `fillResources`** immediately after `buildPubLink`.

```js
// the resources block (publication link, downloads, citation, map tools) for one section.
// rec is the getData record (may be null while loading / if the map has no record).
function renderResources(rec, atts) {
    var sid = atts.series_id;
    var pubLink = '<div class="res-publink">' + buildPubLink(sid, rec) + '</div>';

    var dl = [];
    if (rec && rec.pub_url)   dl.push('<a class="downloadList pdfIcon"  target="_blank" href="' + rec.pub_url + '">PDF</a>');
    if (rec && rec.gis_data)  dl.push('<a class="downloadList gisIcon"  target="_blank" href="https://ugspub.nr.utah.gov/publications/' + rec.gis_data + '">GIS data</a>');
    if (rec && rec.geotiff)   dl.push('<a class="downloadList tiffIcon" target="_blank" href="https://ugspub.nr.utah.gov/publications/' + rec.geotiff + '">GeoTIFF</a>');
    if (rec && rec.x_section) dl.push('<a class="downloadList xsecIcon res-xsec" href="#" data-xsec="' + rec.x_section + '">Cross-section</a>');
    if (rec && rec.bsurl)     dl.push('<a class="downloadList purIcon" target="_blank" href="https://utahmapstore.com/products/' + sid + '">Purchase</a>');
    var downloads = dl.length
        ? '<div class="res-downloads">' + dl.join('') + '</div>'
        : '<div class="res-empty">No downloads available for this map.</div>';

    var citeText = rec ? buildCitation(rec) : '';
    var cite = citeText
        ? '<div class="res-cite"><span class="res-cite-text">' + citeText + '</span>' +
          '<button type="button" class="res-copy" data-cite="' + encodeURIComponent(citeText) + '" title="Copy citation">&#x2398;</button></div>'
        : '';

    var tools = '<div class="res-tools">' +
        '<button type="button" class="res-tool res-pan"   title="Pan to this map">Pan to</button>' +
        '<button type="button" class="res-tool res-zoom"  title="Zoom to this map">Zoom to</button>' +
        '<button type="button" class="res-tool res-share" title="Copy a shareable link">Copy link</button>' +
        '</div>';

    var dlOpen = (atts.units === 'True') ? '' : ' open';   // pub-only maps lead with downloads
    return pubLink +
        '<div class="readout-group readout-group-dl' + dlOpen + '">' +
            '<button type="button" class="readout-group-toggle" aria-expanded="' + (dlOpen ? 'true' : 'false') + '">Downloads &amp; citation</button>' +
            '<div class="readout-group-content">' + downloads + cite + '</div>' +
        '</div>' +
        '<div class="readout-group readout-group-tools">' +
            '<button type="button" class="readout-group-toggle" aria-expanded="false">Map tools</button>' +
            '<div class="readout-group-content">' + tools + '</div>' +
        '</div>';
}

// fill a section's .readout-resources once the (prefetched) getData record resolves
function fillResources(atts, container) {
    if (!container) return;
    getPubData(atts.series_id)
        .then(function (rec) { if (container.isConnected) container.innerHTML = renderResources(rec, atts); })
        .catch(function () { if (container.isConnected) container.innerHTML = renderResources(null, atts); });
}
```

- [ ] **Step 2: Restructure the `units==='True'` render in `loadUnitDescription`.** Replace the `bodyEl.innerHTML = …` assignment (identity + description + the old `.unit-desc-ref` DOI line) with the section-body wrapper + a resources placeholder, then call `fillResources`:

```js
        bodyEl.innerHTML =
            '<div class="readout-section-body">' +
                '<div class="readout-main">' +
                    '<div class="unit-desc-title">' + unit.unit_symbol + ':&nbsp' + unit.unit_name + '&nbsp(' + unit.age + ')</div><hr>' +
                    '<div class="unit-desc-text">' + desc + '</div>' +
                    '<button type="button" class="readout-show-more">Show more</button>' +
                '</div>' +
                '<div class="readout-resources"><img height="14" src="images/loading.gif" alt="">&nbsp;loading&#8230;</div>' +
            '</div>';
        fillResources(atts, bodyEl.querySelector('.readout-resources'));
```

(The old `<div class="unit-desc-ref">…DOI Link…</div>` line is removed — the publication link now lives in the resources block.)

- [ ] **Step 3: Replace `loadPublicationOnly` entirely** with the unified version (its old `paint`/`getPubData` body is superseded by `fillResources`/`renderResources`):

```js
// load a units=False map's publication-only section (no unit description)
function loadPublicationOnly(atts, bodyEl) {
    bodyEl.innerHTML =
        '<div class="readout-section-body readout-pubonly">' +
            '<div class="readout-main"><div class="unit-desc-text">Tabular GIS data has not been generated for this map; see the publication.</div></div>' +
            '<div class="readout-resources"><img height="14" src="images/loading.gif" alt="">&nbsp;loading&#8230;</div>' +
        '</div>';
    fillResources(atts, bodyEl.querySelector('.readout-resources'));
}
```

- [ ] **Step 4: Syntax check.** Run: `node --check public/mapcontrols.js` — exit 0.

- [ ] **Step 5: Manual check.** Run `npx firebase serve --only hosting`; in the browser, enable the unit-descriptions pane and click a detailed map (e.g. Duchesne `M-300DM`) and the Utah State 250k (`Q-2thru5`). Expected: each open section shows the publication link plus "Downloads & citation" and "Map tools" groups (unstyled until Task 5); `Q-2thru5` shows PDF/GeoTIFF + the multi-author citation; a USGS quad (`I-2462`) shows "Publication Page".

- [ ] **Step 6: Commit.**

```bash
git add public/mapcontrols.js
git commit -m "feat(readout): render downloads, citation, and map tools in each section"
```

---

### Task 4: Section tool handlers (pan/zoom/share, copy, cross-section)

**Files:** Modify `public/mapcontrols.js`.

- [ ] **Step 1: Add delegated handlers** next to the other `$(document).on(...)` / jQuery click handlers (sections are rebuilt on every click, so delegation is required).

```js
// resources: copy citation
$(document).on('click', '#udTab .res-copy', function (e) {
    e.preventDefault();
    copyToClipboard(decodeURIComponent(this.getAttribute('data-cite') || ''));
});
// resources: open the cross-section in the existing image viewer
$(document).on('click', '#udTab .res-xsec', function (e) {
    e.preventDefault();
    $('.xsection-img').attr('src', 'https://ugspub.nr.utah.gov/publications/' + this.getAttribute('data-xsec'));
    $('#xsection-pane').removeClass('hidden');
});
// resources: pan / zoom / share, keyed to the section's footprint via the nearest data-idx
$(document).on('click', '#udTab .res-tool', function (e) {
    e.preventDefault();
    var host = this.closest('[data-idx]');
    if (!host) return;
    var ftr = accordionFtrs[parseInt(host.getAttribute('data-idx'), 10)];
    if (!ftr || !ftr.geometry) return;
    var ext = ftr.geometry.extent;
    if (this.classList.contains('res-pan') && ext) {
        view.center = ext.center;
    } else if (this.classList.contains('res-zoom') && ext) {
        view.extent = ext;
        view.zoom = view.zoom - 1;
    } else if (this.classList.contains('res-share')) {
        var sid = ftr.attributes.series_id;
        var sc = parseInt(ftr.attributes.scale);
        var lyrs = (sc <= 24) ? '24k' : (sc < 250) ? '100k' : '500k';
        var base = window.location.href.split('#')[0].split('?')[0];
        copyToClipboard(encodeURI(base + '?view=scene&sid=' + sid + '&layers=' + lyrs));
    }
});
```

- [ ] **Step 2: Syntax check.** Run: `node --check public/mapcontrols.js` — exit 0.

- [ ] **Step 3: Manual check.** Reload local; open a section. Expected: "Copy link" / "Pan to" / "Zoom to" act on that map's footprint; the citation copy button copies the reference; "Cross-section" (on a map that has one) opens the `#xsection-pane` image.

- [ ] **Step 4: Commit.**

```bash
git add public/mapcontrols.js
git commit -m "feat(readout): wire section pan/zoom/share, citation copy, and cross-section viewer"
```

---

### Task 5: Responsive layout, disclosure groups, icon reuse, mobile truncation

**Files:** Modify `public/style.css`, `public/mapcontrols.js`.

- [ ] **Step 1: Add the resources/section CSS** (append within the readout CSS region of `public/style.css`).

```css
/* consolidated section: stacked by default; two columns on desktop (Task assigns the media query) */
.readout-section-body { display: block; }
.readout-main, .readout-resources { min-width: 0; }

.res-publink { font-size: 11px; margin: 4px 0; }
.res-downloads { display: flex; flex-direction: column; gap: 3px; margin: 4px 0; }
.res-downloads .downloadList { font-size: 12px; line-height: 18px; }
.res-empty { font-size: 11px; color: #9a9a9a; margin: 4px 0; }

.res-cite { display: flex; align-items: flex-start; gap: 6px; margin-top: 8px; font-size: 10px; line-height: 13px; color: #555; }
.res-cite-text { flex: 1; }
.res-copy { flex: none; border: none; background: none; cursor: pointer; color: #326A98; font-size: 14px; line-height: 1; padding: 0; }

.res-tools { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
.res-tool { font-size: 11px; padding: 3px 8px; border: 1px solid #d4dde7; border-radius: 4px; background: #f5f6f8; color: #326A98; cursor: pointer; }
.res-tool:hover { background: #eceff4; }

/* disclosure groups: collapsible on mobile, always-open rail on desktop */
.readout-group { margin-top: 8px; }
.readout-group-toggle { display: flex; align-items: center; gap: 6px; width: 100%; text-align: left; border: none; background: none; padding: 4px 0; cursor: pointer; font: 600 12px "Avenir Next W00", Helvetica, Arial, sans-serif; color: #4a4a4a; }
.readout-group-toggle::before { content: "\25B8"; font-size: 9px; transition: transform .15s ease; }
.readout-group.open .readout-group-toggle::before { transform: rotate(90deg); }
.readout-group-content { display: none; padding-left: 2px; }
.readout-group.open .readout-group-content { display: block; }

.readout-show-more { display: none; border: none; background: none; color: #326A98; cursor: pointer; font-size: 11px; padding: 2px 0; }

@media (min-width: 768px) {
    .readout-section-body { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(165px, 1fr); gap: 12px; }
    .readout-pubonly .readout-section-body { grid-template-columns: 1fr; }
    .readout-group-toggle { display: none; }      /* desktop = always-visible rail, no toggles */
    .readout-group-content { display: block; }
    .readout-group { margin-top: 10px; }
}

@media (max-width: 767px) {
    .readout-main .unit-desc-text { display: -webkit-box; -webkit-line-clamp: 5; -webkit-box-orient: vertical; overflow: hidden; }
    .readout-main.expanded .unit-desc-text { -webkit-line-clamp: unset; overflow: visible; }
    .readout-show-more { display: inline-block; }
}

@media (prefers-reduced-motion: reduce) {
    .readout-group-toggle::before { transition: none; }
}
```

- [ ] **Step 2: Add the disclosure + show-more handlers** in `public/mapcontrols.js` (next to the Task 4 handlers).

```js
// resources: toggle a disclosure group (mobile); description show more/less (mobile)
$(document).on('click', '#udTab .readout-group-toggle', function () {
    var open = this.parentNode.classList.toggle('open');
    this.setAttribute('aria-expanded', open ? 'true' : 'false');
});
$(document).on('click', '#udTab .readout-show-more', function () {
    var main = this.closest('.readout-main');
    if (!main) return;
    this.textContent = main.classList.toggle('expanded') ? 'Show less' : 'Show more';
});
```

- [ ] **Step 3: Checks.** Run `node --check public/mapcontrols.js` (exit 0) and confirm `style.css` braces balance.

- [ ] **Step 4: Manual check.** Local browser. Desktop window (>768px): open section shows description left, resources rail right (groups expanded, no toggles). Narrow the window (<768px): layout stacks, groups collapse with ▸ toggles, description clamps to 5 lines with "Show more".

- [ ] **Step 5: Commit.**

```bash
git add public/style.css public/mapcontrols.js
git commit -m "feat(readout): responsive 2-col/stacked layout, disclosure groups, mobile truncation"
```

---

### Task 6: Single-scroll panel + widen desktop / bottom sheet mobile

**Files:** Modify `public/style.css`.

- [ ] **Step 1: Revert the pinned-flex readout rules to plain flow** so there is one scroll container. In `public/style.css`, change:

```css
.map-readout { display: flex; flex-direction: column; max-height: calc(75vh - 30px); font-size: 13px; }
```
to:
```css
.map-readout { font-size: 13px; }
```
Change `.readout-primary { flex: 0 1 auto; min-height: 0; display: flex; flex-direction: column; padding: 0 2px; }` to `.readout-primary { padding: 0 2px; }`. Change `.readout-others { … }` to drop `flex`, `min-height`, `display:flex`, `overflow-y`, `overscroll-behavior` (keep its `border-top`/`margin-top`/`padding-top`). **Delete** the rules `.readout-primary .map-section-readout { … max-height: 45vh … }` and `.map-section.open .map-section-readout { max-height: 30vh … }`. Drop `flex: none;` from `.map-section` and `.other-maps-label`.

(Progressive disclosure now keeps sections compact, so a single panel scrollbar is correct and the nested `vh` caps that caused the multi-scrollbar confusion are gone.)

- [ ] **Step 2: Widen the desktop panel + add the mobile bottom sheet.** Change `#unitsPane`'s `width: 300px;` to `width: 440px;` and its `opacity: 0.85;` to `opacity: 0.96;` (leave `max-height`, `position`, `bottom`, `right`, `padding` as set in PR #144). Add, after the `#unitsPane` rule:

```css
@media (max-width: 767px) {
    #unitsPane { width: auto; left: 5px; right: 5px; max-height: 70vh; }
}
```

- [ ] **Step 3: Confirm braces balance** in `style.css`.

- [ ] **Step 4: Manual check.** Local browser. Desktop: panel is ~440px, one scrollbar, text crisp. Zoom Chrome to ~150–175% with a long description + an open "other map": nothing clipped, single scrollbar. Narrow window: panel spans full width, bottom-anchored.

- [ ] **Step 5: Commit.**

```bash
git add public/style.css
git commit -m "feat(readout): single-scroll panel, 440px desktop / full-width bottom sheet on mobile"
```

---

### Task 7: Pin the panel header/close (flex panel + class-based show/hide)

**Files:** Modify `public/style.css`, `public/mapcontrols.js`.

- [ ] **Step 1: Make `#udTab` the scroll container and `#unitsPane` a non-scrolling flex column.** In `public/style.css`, change `#unitsPane`'s `overflow-y: auto;` to `overflow: hidden;` and add `display: flex; flex-direction: column;`. Add these rules after it:

```css
/* #udTab is the single scroller; the close button (absolute in #unitsPane) stays pinned */
#udTab { flex: 1 1 auto; min-height: 0; overflow-y: auto; }
#unitsPane.hidden { display: none; }   /* beat the id-specificity of display:flex when hidden */
```

- [ ] **Step 2: Switch `#unitsPane` show/hide to class-based** so jQuery's `.show()` can't inject `display:block` over the flex layout. In `public/mapcontrols.js` replace every `$("#unitsPane").show()` with `$("#unitsPane").removeClass("hidden")` (the click handler that opens the readout, and the Macrostrat/out-of-state paths — there are three) and every `$("#unitsPane").hide()` with `$("#unitsPane").addClass("hidden")` (the `#fms-close` handler and `toggleMapDl`). Leave existing `addClass("hidden")` calls as-is.

- [ ] **Step 3: Syntax check.** Run: `node --check public/mapcontrols.js` (exit 0); confirm `style.css` braces balance.

- [ ] **Step 4: Manual check.** Local browser. Open the readout, scroll a long section: the close "✕" stays pinned (does not scroll away). Confirm the panel still opens on click and closes via ✕, and that switching to/from any other tool still hides/shows it.

- [ ] **Step 5: Commit.**

```bash
git add public/style.css public/mapcontrols.js
git commit -m "feat(readout): pin panel header/close via flex layout + class-based show/hide"
```

---

### Task 8: Verification matrix + pre-commit review

**Files:** none unless fixes are needed.

- [ ] **Step 1: Run the full matrix** locally (`npx firebase serve`):
  - Desktop ≥768px: two-column section, full description, rail with publication link + downloads (icons) + citation (copy works) + tools (pan/zoom/share); single scrollbar; pinned ✕.
  - Mobile <768px: bottom sheet, one column, description clamps with "Show more", groups collapse/expand.
  - `units==='True'` (`M-300DM`): description + **DOI Link** + downloads.
  - `units!=='True'` UGS/UGMS (`Q-2thru5`): publication note + **DOI Link** + PDF/GeoTIFF + multi-author citation.
  - non-UGS (`I-2462`, USGS): **Publication Page** (not DOI) + any downloads.
  - Multiple maps at a point: accordion of others; opening one renders the same responsive body; clicked map stays default-open.
  - Cross-section viewer opens; "Copy link" yields `…?view=scene&sid=…&layers=…`.

- [ ] **Step 2: Final checks.** `node --check public/mapcontrols.js` (exit 0); `style.css` braces balance.

- [ ] **Step 3: Pre-commit review.** Per repo convention, run a code-review subagent and a frontend reviewer on the cumulative diff (`git diff origin/dev...HEAD`): correctness (the two render paths don't regress the 500k / Macrostrat / out-of-state cases; delegation handlers; class-based show/hide doesn't break any visibility check), and layout (single-scroll, responsive grid, sticky close, zoom). Address every finding in the same pass.

- [ ] **Step 4: Commit any review fixes**, then stop — open the PR into `dev` only on the user's go-ahead.

```bash
git add -A
git commit -m "fix(readout): address review findings on the consolidated panel"
```

---

## Self-review

- **Spec coverage:** consolidated section both `units` paths (Task 3); downloads/citation/tools + parity (Tasks 3–4, function table → `renderResources`); responsive 2-col/disclosure (Task 5); single scroll (Task 6); sticky header (Task 7); prefetch-all (Task 2); citation/pub-link helpers reused (Task 1); a11y (`aria-expanded`, real buttons) + reduced-motion + mobile truncation (Task 5); icon reuse (Task 3 classes + Task 5 styling); panel widen/opacity/bottom sheet (Task 6); verification matrix + review (Task 8). Card removal + layer-list reorg explicitly deferred (out of scope, per spec). Covered.
- **Placeholders:** none — every code step has concrete code; every command has expected output.
- **Type/name consistency:** `buildCitation`, `buildPubLink`, `renderResources`, `fillResources`, `getPubData`, `prefetchPubData`, `accordionFtrs`, and the CSS class names (`readout-section-body`, `readout-main`, `readout-resources`, `readout-group`/`-toggle`/`-content`, `res-downloads`/`-cite`/`-copy`/`-tools`/`-tool`/`-pan`/`-zoom`/`-share`/`-xsec`, `readout-show-more`) are used consistently across tasks. The `data-idx` lookup in Task 4 matches the `data-idx` emitted by `buildAccordion` on `.map-section-readout`.
- **Risk note:** Task 7's class-based show/hide must replace *all* `#unitsPane` `.show()`/`.hide()` calls; a missed one would leave the panel stuck. Grep `rg "#unitsPane"` before committing Task 7 to confirm none remain on `.show()/.hide()`.
