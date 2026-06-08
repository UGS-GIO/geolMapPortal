# Readout Visual Redesign ("Refined Light") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the approved "Refined Light" visual polish to the click-readout panel — crisp inline-SVG resource icons, a stronger blue header with an accent bar, an accented unit symbol, a "Resources" label, and a visible-but-muted grayed state — with no behavioral change.

**Architecture:** Two files only — `public/mapcontrols.js` (`renderResources` + the unit-title markup in `loadUnitDescription`) and `public/style.css` (the `.readout-*` / `.res-*` rules). The legacy `.pdfIcon`/`.gisIcon`/… PNG classes stay in CSS (still used by the not-yet-removed Map Downloads card `printPubs`); the readout simply stops using them in favor of inline SVG drawn with `currentColor` so the chip color drives the icon.

**Tech Stack:** Vanilla JS (ArcGIS Maps SDK + jQuery) + CSS, inline SVG. No new libraries, no build step.

**Testing note:** This repo has no frontend test runner (`npm test` is a no-op). Per-task checks are `node --check public/mapcontrols.js` (JS parses) and CSS brace balance. Full visual fidelity is verified on the **preview channel** after the PR build (Task 3). Node 24/25 locally breaks the Firebase CLI but NOT `node --check`; if `node --check` ever complains, use `PATH="/opt/homebrew/opt/node@22/bin:$PATH" node --check …`.

Spec: `docs/specs/2026-06-08-readout-visual-redesign-design.md`. Branch: `feat/readout-redesign`.

---

## File structure

- **Modify** `public/mapcontrols.js` — add a module-level `RES_ICONS` map (type → inline SVG string); rewrite the `renderResources` chip builder to emit SVG + a "Resources" label and drop the legacy icon classes; accent the unit symbol/age in `loadUnitDescription`'s title.
- **Modify** `public/style.css` — `.res-chip`/`.res-chip-off` (flex + SVG, no background-image, grayed = gray currentColor); `.res-label`; `.readout-primary-head` accent bar + title color/size; `.unit-desc-title .ud-sym`/`.ud-age`.

No new files. No `package.json` change.

Out of scope (separate specs): the dark theme, Map Downloads card removal, layer-list/tools reorg.

---

### Task 1: Inline-SVG resource icons (replace the faint PNG glyphs)

**Files:** Modify `public/mapcontrols.js`, `public/style.css`.

- [ ] **Step 1: Add the `RES_ICONS` map** immediately above `function renderResources` in `public/mapcontrols.js` (it currently starts with the comment `// the resources block (publication link, downloads, citation, map tools) for one section.`). Insert before that comment:

```js
// inline resource icons, drawn with currentColor so the chip's text color drives the icon
// (active = link blue, unavailable = gray). Replaces the faint background-PNG glyphs in the readout.
var RES_ICONS = {
    pdf:  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M6 2.5h7l5 5V21.5H6z"/><path d="M13 2.5V8h5"/><path d="M9 13h6M9 16.5h6" stroke-width="1.3"/></svg>',
    gis:  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M12 3l9 4.5-9 4.5-9-4.5z"/><path d="M3 12l9 4.5 9-4.5"/><path d="M3 16.5l9 4.5 9-4.5"/></svg>',
    tiff: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.6" fill="currentColor" stroke="none"/><path d="M5 17.5l4.5-5 3 3.5L16 11l3.5 6.5"/></svg>',
    xsec: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 16c3-8 6-8 9 0s6 5 9-3"/><path d="M3 8.5h18"/></svg>',
    lith: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="7" y="3" width="10" height="4.2" rx="1"/><rect x="7" y="9" width="10" height="5.4" rx="1"/><rect x="7" y="16" width="10" height="5" rx="1"/></svg>',
    pur:  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M3.5 4h2l2.2 10.5h9.3L19 7H7"/><circle cx="10" cy="19.5" r="1.4" fill="currentColor" stroke="none"/><circle cx="17" cy="19.5" r="1.4" fill="currentColor" stroke="none"/></svg>'
};
```

- [ ] **Step 2: Rewrite the chip section of `renderResources`.** Replace the existing `items` array + `chips` builder (the block from `var items = [` through the `.join('');` that ends the `chips` assignment) with:

```js
    // consistent resource set: every map shows all six types so layouts match and "grayed" reads as
    // "this map doesn't have it" (not "broken"). href = external download/link; img = in-app viewer.
    var items = [
        { ic: 'pdf',  label: 'PDF',               href: (rec && rec.pub_url)   ? rec.pub_url : '' },
        { ic: 'gis',  label: 'GIS data',          href: (rec && rec.gis_data)  ? base + rec.gis_data : '' },
        { ic: 'tiff', label: 'GeoTIFF',           href: (rec && rec.geotiff)   ? base + rec.geotiff : '' },
        { ic: 'xsec', label: 'Cross-section',     img:  (rec && rec.x_section) ? base + rec.x_section : '' },
        { ic: 'lith', label: 'Lithologic column', img:  (rec && rec.lith_col)  ? base + rec.lith_col : '' },
        { ic: 'pur',  label: 'Purchase',          href: (rec && rec.bsurl)     ? 'https://utahmapstore.com/products/' + sid : '' }
    ];
    var chips = items.map(function (it) {
        var icon = RES_ICONS[it.ic];
        if (it.href) return '<a class="res-chip" target="_blank" rel="noopener" href="' + it.href + '">' + icon + '<span>' + it.label + '</span></a>';
        if (it.img)  return '<a class="res-chip res-img" href="#" data-img="' + it.img + '">' + icon + '<span>' + it.label + '</span></a>';
        return '<span class="res-chip res-chip-off" title="Not available for this map">' + icon + '<span>' + it.label + '</span></span>';
    }).join('');
```

(The label is wrapped in `<span>` so the chip is exactly two flex children — icon + label.)

- [ ] **Step 3: Update the resource-chip CSS.** In `public/style.css`, replace the `.res-chip` rule and the `.res-chip-off` rule. The current rules are:

```css
.res-chip { font-size: 12px; line-height: 24px; min-height: 24px; display: flex; align-items: center; color: #326A98; text-decoration: none; background-repeat: no-repeat; background-position: left center; background-size: 22px 22px; padding-left: 28px; }
.res-chip:hover { color: #1d4e78; text-decoration: underline; }
.res-chip-off { color: #8a8a8a; cursor: not-allowed; filter: grayscale(1); opacity: 0.8; }
.res-chip-off:hover { color: #8a8a8a; text-decoration: none; }
```

Replace those four lines with:

```css
.res-chip { font-size: 12.5px; min-height: 24px; display: flex; align-items: center; gap: 8px; color: #326A98; text-decoration: none; }
.res-chip svg { flex: none; }
.res-chip span { min-width: 0; overflow-wrap: anywhere; }
.res-chip:hover { color: #1d4e78; }
.res-chip:hover span { text-decoration: underline; }
.res-chip-off { color: #8d8d8d; cursor: not-allowed; }
.res-chip-off:hover span { text-decoration: none; }
```

- [ ] **Step 4: Checks.** Run `PATH="/opt/homebrew/opt/node@22/bin:$PATH" node --check public/mapcontrols.js` (expect no output, exit 0) and confirm braces balance:

```bash
[ "$(tr -cd '{' < public/style.css | wc -c)" = "$(tr -cd '}' < public/style.css | wc -c)" ] && echo balanced
```
Expected: `balanced`.

- [ ] **Step 5: Commit.**

```bash
git add public/mapcontrols.js public/style.css
git commit -m "feat(readout): crisp inline-SVG resource icons (currentColor), grayed = gray"
```

---

### Task 2: Header accent, unit-symbol accent, and "Resources" label

**Files:** Modify `public/mapcontrols.js`, `public/style.css`.

- [ ] **Step 1: Add the "Resources" label** to `renderResources`'s return in `public/mapcontrols.js`. The current final line is:

```js
    return '<div class="res-grid">' + chips + '</div>' + pubLink + cite + tools;
```

Replace it with:

```js
    return '<div class="res-label">Resources</div><div class="res-grid">' + chips + '</div>' + pubLink + cite + tools;
```

- [ ] **Step 2: Accent the unit symbol/age** in `loadUnitDescription`. The current title line is:

```js
                    '<div class="unit-desc-title">' + unit.unit_symbol + ':&nbsp;' + unit.unit_name + '&nbsp;(' + unit.age + ')</div><hr>' +
```

Replace it with:

```js
                    '<div class="unit-desc-title"><span class="ud-sym">' + unit.unit_symbol + '</span>:&nbsp;' + unit.unit_name + '&nbsp;<span class="ud-age">(' + unit.age + ')</span></div><hr>' +
```

- [ ] **Step 3: Add the header/hierarchy CSS.** In `public/style.css`:

(a) Replace the `.readout-primary-head` and `.readout-primary-title` rules. Current:

```css
.readout-primary-head { position: sticky; top: 0; z-index: 1; display: flex; align-items: center; gap: 10px; background: #fff; padding: 0 28px 6px 0; border-bottom: 1px solid #eee; margin-bottom: 6px; }
.readout-primary-title { flex: 1; min-width: 0; font-family: "Bebas Neue Regular", Verdana, sans-serif; font-size: 16px; letter-spacing: .3px; line-height: 1.1; color: #326A98; overflow-wrap: anywhere; }
```

Replace with (adds `position: relative` is unnecessary — `sticky` already establishes positioning — so the `::after` anchors to the head):

```css
.readout-primary-head { position: sticky; top: 0; z-index: 1; display: flex; align-items: center; gap: 10px; background: #fff; padding: 0 28px 7px 0; border-bottom: 1px solid #ededed; margin-bottom: 8px; }
.readout-primary-head::after { content: ""; position: absolute; left: 0; bottom: -1px; width: 54px; height: 2px; background: #326A98; border-radius: 2px; }
.readout-primary-title { flex: 1; min-width: 0; font-family: "Bebas Neue Regular", Verdana, sans-serif; font-size: 18px; letter-spacing: .4px; line-height: 1.08; color: #235c87; overflow-wrap: anywhere; }
```

(b) Add the unit-symbol/age + "Resources" label rules. Insert them immediately after the existing `.readout-main hr { … }` line:

```css
.unit-desc-title .ud-sym { color: #326A98; }
.unit-desc-title .ud-age { font-weight: 400; color: #777; }
.res-label { margin: 14px 0 6px; font-size: 10px; font-weight: 700; letter-spacing: .9px; text-transform: uppercase; color: #9aa0a6; }
```

- [ ] **Step 4: Checks.** `PATH="/opt/homebrew/opt/node@22/bin:$PATH" node --check public/mapcontrols.js` (exit 0); braces:

```bash
[ "$(tr -cd '{' < public/style.css | wc -c)" = "$(tr -cd '}' < public/style.css | wc -c)" ] && echo balanced
```
Expected: `balanced`.

- [ ] **Step 5: Commit.**

```bash
git add public/mapcontrols.js public/style.css
git commit -m "feat(readout): blue header with accent bar, accented unit symbol, Resources label"
```

---

### Task 3: Verification matrix + pre-commit review

**Files:** none unless fixes are needed.

- [ ] **Step 1: Push and open/refresh the preview.** The branch `feat/readout-redesign` already exists; pushing re-runs the per-PR preview build. If no PR is open yet for this branch, open one into `dev` (title `feat(readout): Refined Light visual redesign`); otherwise just `git push`. Capture the `…--<branch>-<hash>.web.app` preview URL from the PR's `build_and_preview` run comment.

```bash
git push
```

- [ ] **Step 2: Run the visual matrix** on the preview URL (real ArcGIS layers load there):
  - Click a **unit map** (e.g. Provo 24k / `M-249`): the **accent bar** sits under the blue title; the **unit symbol** is blue, age muted; a **"RESOURCES"** label precedes the grid; the six chips show **crisp colored SVG icons**; available chips are link-blue, **grayed chips (e.g. GeoTIFF) are a clear medium gray** with the "not available" tooltip; **DOI Link: https://doi.org/…** is written out above the citation; the **Copy** button is visible; Pan/Zoom/Copy link/Preview work.
  - A **no-unit / pub-only map** (`MP-17-2DM`): resources still render (empty-state path) with the same icons/label.
  - A **non-UGS map** (USGS): shows **Publication Page** (a plain hyperlink, not the written-out DOI).
  - **Mobile** (narrow window / bottom sheet): chips wrap to fewer columns; icons + grayed state still read; title-row toggle intact.
  - The **image viewer** (cross-section / lith column / preview) still opens and closes on Esc / any click.

- [ ] **Step 3: Final static checks.** `PATH="/opt/homebrew/opt/node@22/bin:$PATH" node --check public/mapcontrols.js` (exit 0); `style.css` braces balance.

- [ ] **Step 4: Pre-commit review** (repo convention). Run a code-review subagent and a frontend reviewer on the cumulative diff (`git diff feat/consolidated-readout-panel...HEAD`): correctness (the SVG chip markup is exactly icon+label; `currentColor` makes active blue / off gray; the `.pdfIcon` legacy classes are untouched so `printPubs` still works; `loadUnitDescription`'s no-unit/catch branches still render resources), and visual soundness (icon legibility at 20px and in gray, header accent, hierarchy, mobile wrap). Address every finding in the same pass.

- [ ] **Step 5: Commit any review fixes.**

```bash
git add -A
git commit -m "fix(readout): address review findings on the visual redesign"
```

---

## Self-review

- **Spec coverage:** header (title blue `#235c87` + accent bar) → Task 2; inline-SVG iconography replacing PNGs with `currentColor`, grayed-visible → Task 1; hierarchy (accented symbol, "Resources" label, spacing) → Task 2; preserved DOI/Copy/toggle/viewer/grid/empty-state → untouched by design (verified Task 3); scope/constraints (vanilla, no libs, visual only) → respected (only `.res-*`/`.readout-*` + `renderResources`/`loadUnitDescription` touched). Covered.
- **Placeholders:** none — every code step has complete copy-pasteable code; every check has an exact command + expected output.
- **Type/name consistency:** `RES_ICONS` keys (`pdf`/`gis`/`tiff`/`xsec`/`lith`/`pur`) match the `it.ic` values in the `items` array; `.res-chip`/`.res-chip-off`/`.res-label`/`.ud-sym`/`.ud-age` are used consistently between the JS that emits them (Tasks 1–2) and the CSS that styles them (Tasks 1–2). The `res-img` class + `data-img` (image-viewer handler) are preserved unchanged.
- **Risk:** the SVG icons must read at 20px and when gray — Task 3 verifies on the dev preview and allows path tuning.
