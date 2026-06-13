# Right-rail restyle + app-wide dark mode — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the right-rail tools to "Refined Light" (treatment A) and add an app-wide, manually-toggled, persisted light/dark theme built on CSS custom properties.

**Architecture:** Introduce a token layer (`:root` light values + `:root[data-theme="dark"]` overrides), refactor the existing #156 Refined-Light rules to reference the tokens, then build the rail + flyouts on the same tokens. A sun/moon button at the rail bottom flips `data-theme` on `<html>` and persists it to `localStorage`; an inline `<head>` script applies the stored theme before first paint.

**Tech Stack:** Vanilla JS (ArcGIS Maps SDK 4.29 + jQuery), plain HTML/CSS. **No build step, no module system, no test runner.**

**Spec:** `docs/specs/2026-06-12-rail-restyle-and-dark-mode-design.md`

**Branch:** `feat/right-rail-and-theme` (already created, stacked on `feat/unified-map-panel` / PR #156).

---

## Verification toolkit (this project has no test runner)

Each task is verified by these instead of automated tests:

- **JS syntax:** `node --check public/mapcontrols.js` → expect no output (exit 0).
- **CSS brace balance:** `node -e "const s=require('fs').readFileSync('public/style.css','utf8');const o=(s.match(/{/g)||[]).length,c=(s.match(/}/g)||[]).length;console.log(o===c?'BALANCED':'MISMATCH')"` → expect `BALANCED`.
- **Manual (the real check):** open `public/index.html` locally for per-task spot-checks; full verification happens on the **PR #156-stack Firebase preview** after push. Dark mode is toggled in-app once Task 5 lands; before that, set it in DevTools console: `document.documentElement.setAttribute('data-theme','dark')`.

Commit after every task (Conventional Commits; no AI attribution — repo rule).

## Files

- **`public/style.css`** — add the token blocks; refactor #156 rules to `var()`; restyle the rail + flyouts; rail active state; SVG glyph + toggle styles.
- **`public/index.html`** — anti-FOUC inline script in `<head>`; SVG icon sprite; swap rail icons to `<use>`; remove `theme-color` from rail + flyouts; add the theme-toggle button; compact flyout headers (M2 markup for config/unit-search).
- **`public/mapcontrols.js`** — `THEME_KEY` + toggle handler/persistence next to the existing rail handlers (~1525).

---

# Milestone 1 — Theme foundation + rail (A) + Search/Geocoder

### Task 1: Add the theme token blocks (declarations only)

Adds the variables; nothing references them yet, so this is visually inert. Light values equal today's hex, so nothing shifts.

**Files:** Modify `public/style.css` (insert immediately before `.theme-color {` at ~line 90).

- [ ] **Step 1: Insert the token blocks**

```css
/* ============================================================
   Theme tokens — light (default) + dark ([data-theme="dark"]).
   Light values equal the pre-existing hardcoded hex, so light
   mode renders unchanged; dark just adds the second column.
   ============================================================ */
:root {
  --panel:#ffffff;        --flyout:#ffffff;
  --card:#f5f6f8;         --card-open:#ffffff;    --card-hover:#eceff4;
  --border:#e3e3e3;       --border-open:#d4dde7;  --divider:#ededed;
  --text:#4a4a4a;         --muted:#9a9a9a;        --muted-soft:#7a8794;
  --title:#235c87;        --title-strong:#326A98;
  --accent:#326A98;       --accent-on:#6396fc;
  --switch-off:#c6c6c6;   --chevron:#9aa3ad;
  --tab-bg:#f7f9fc;       --tab-text:#7a8794;
  --tab-sel-bg:#ffffff;   --tab-sel-text:#235c87; --tab-underline:#326A98;
  --rail-bg:#f5f6f8;      --rail-border:#e3e3e3;  --rail-glyph:#54585c;
  --rail-active-bg:#326A98; --rail-active-glyph:#ffffff;
  --field:#ffffff;        --field-border:#e3e3e3; --field-text:#444444;
  --shadow:0 1px 5px rgba(50,106,152,.12);
  --shadow-lift:0 4px 16px rgba(40,60,80,.16);
}
:root[data-theme="dark"] {
  --panel:#1f262e;        --flyout:#222a33;
  --card:#2a323c;         --card-open:#323d49;    --card-hover:#333d49;
  --border:#3a434e;       --border-open:#46566a;  --divider:rgba(255,255,255,.07);
  --text:#dde3e9;         --muted:#8b95a0;        --muted-soft:#8b95a0;
  --title:#86b8ea;        --title-strong:#9cc6f0;
  --accent:#6396fc;       --accent-on:#6ea0ff;
  --switch-off:#4a535e;   --chevron:#7d8893;
  --tab-bg:#222a33;       --tab-text:#8b95a0;
  --tab-sel-bg:#2a323c;   --tab-sel-text:#cfe0f2; --tab-underline:#6396fc;
  --rail-bg:#252d36;      --rail-border:#333d49;  --rail-glyph:#cdd4db;
  --rail-active-bg:#6396fc; --rail-active-glyph:#ffffff;
  --field:#1a2027;        --field-border:#3a434e; --field-text:#dde3e9;
  --shadow:0 2px 10px rgba(0,0,0,.45);
  --shadow-lift:0 6px 20px rgba(0,0,0,.5);
}
```

- [ ] **Step 2: Verify brace balance** → run the CSS brace command → expect `BALANCED`.
- [ ] **Step 3: Verify visually** → open `public/index.html`; everything looks exactly as before (no rule uses the tokens yet).
- [ ] **Step 4: Commit**

```bash
git add public/style.css
git commit -m "feat(theme): add light/dark CSS token blocks"
```

### Task 2: Anti-FOUC inline script + data-theme plumbing

Applies a stored dark theme before first paint so returning dark users don't flash light.

**Files:** Modify `public/index.html` (immediately after `<head>` at line 4, before the GTM script).

- [ ] **Step 1: Insert the inline script as the first thing in `<head>`**

```html
    <head>
        <script>
          /* apply stored theme before paint (no FOUC). default = light */
          try { if (localStorage.getItem('ugsMapTheme') === 'dark') document.documentElement.setAttribute('data-theme','dark'); } catch (e) {}
        </script>
```

- [ ] **Step 2: Verify** → open `public/index.html`; in the console run `localStorage.setItem('ugsMapTheme','dark')` then reload → DevTools shows `<html data-theme="dark">`. Nothing is styled dark yet (Task 3). Run `localStorage.removeItem('ugsMapTheme')` and reload → attribute gone.
- [ ] **Step 3: Commit**

```bash
git add public/index.html
git commit -m "feat(theme): apply stored theme before paint"
```

### Task 3: Refactor the #156 Refined-Light rules to reference tokens

Mechanical replacement of hardcoded hex with `var(--token)` in the existing rule blocks. Because light token values equal the current hex, **light mode must look pixel-identical**; dark mode now renders for the first time.

**Files:** Modify `public/style.css` in these existing ranges: `#unitsPane` (1288), `.panel-tabs`/`.panel-tab*` (1295-1298), `#unitsPane #layersPanel …` (1300-1333), `.readout-empty` (1335), `.readout-primary-title` (2010), `.other-maps-label` (2014), `.map-section*` + `.layer-switch*` (2017-2042).

**The mapping (apply throughout those ranges):**

| Current hex / context | Replace with |
|---|---|
| `#unitsPane` bg `white` | `var(--panel)` |
| `#f5f6f8` (card bg) | `var(--card)` |
| `#fff`/`#ffffff` as `.map-section.open` bg | `var(--card-open)` |
| `#eceff4` (hover) | `var(--card-hover)` |
| `#e3e3e3` (border) | `var(--border)` |
| `#d4dde7` (`.map-section.open` border) | `var(--border-open)` |
| `#ededed`, `#e8eaed`, `#e6e8ea` (hairlines) | `var(--divider)` |
| `#4a4a4a` (row text); `#6a6a6a` (`.layer-switch` text) | `var(--text)` |
| `#9a9a9a`, `#8a8f94` (labels/empty) | `var(--muted)` |
| `#7a8794` (`--disp-val`, soft) | `var(--muted-soft)` |
| `#235c87` (panel/primary titles) | `var(--title)` |
| `#9aa3ad` (chevron) | `var(--chevron)` |
| `#c6c6c6` (switch off track) | `var(--switch-off)` |
| `#6396fc` (checked switch bg, focus outline) | `var(--accent-on)` |
| `#f7f9fc` (tab bg) | `var(--tab-bg)` |
| `#7a8794` (tab text) | `var(--tab-text)` |

**`#326A98` is context-dependent — map each by role (this is why dark differs):**
- `.panel-tab.selected::after { background:#326A98 }` → `var(--tab-underline)`
- `.map-section.open .map-section-title { color:#326A98 }` → `var(--title-strong)`
- `.map-section.open .map-section-chevron { border-color:#326A98 }` → `var(--title-strong)`
- `.op-range::-webkit-slider-thumb` / `::-moz-range-thumb { border:2px solid #326A98 }` → `var(--accent)`
- `.panel-tab.selected { color:#235c87 }` → `var(--tab-sel-text)`; `.panel-tab.selected { background:#fff }` → `var(--tab-sel-bg)`

- [ ] **Step 1: Apply the mapping.** Two worked examples to fix the pattern:

```css
/* before (1295-1298) */
.panel-tabs { ... border-bottom: 1px solid #ededed; ... }
.panel-tab { ... background: #f7f9fc; color: #7a8794; ... }
.panel-tab.selected { background: #fff; color: #235c87; }
.panel-tab.selected::after { ... background: #326A98; ... }
/* after */
.panel-tabs { ... border-bottom: 1px solid var(--divider); ... }
.panel-tab { ... background: var(--tab-bg); color: var(--tab-text); ... }
.panel-tab.selected { background: var(--tab-sel-bg); color: var(--tab-sel-text); }
.panel-tab.selected::after { ... background: var(--tab-underline); ... }
```

```css
/* before (2017-2024) */
.map-section { border: 1px solid #e3e3e3; ... background: #f5f6f8; ... }
.map-section:hover { background: #eceff4; }
.map-section.open { background: #fff; border-color: #d4dde7; box-shadow: 0 1px 5px rgba(50,106,152,.12); }
.map-section-title { ... color: #4a4a4a; ... }
.map-section.open .map-section-title { color: #326A98; }
/* after */
.map-section { border: 1px solid var(--border); ... background: var(--card); ... }
.map-section:hover { background: var(--card-hover); }
.map-section.open { background: var(--card-open); border-color: var(--border-open); box-shadow: var(--shadow); }
.map-section-title { ... color: var(--text); ... }
.map-section.open .map-section-title { color: var(--title-strong); }
```

Leave `.lyr-row.setactive/.greyedout` status dots (`#58a55c`/`#c4ccd2`, ~786-788) literal — they're semantic status colors (watch-item: the gray dot on a dark card; revisit if it reads poorly).

- [ ] **Step 2: Brace balance** → `BALANCED`.
- [ ] **Step 3: Verify light parity** → open `public/index.html`; open the Map panel (Layers + Identify) and compare against `git stash`/the branch before — must look identical.
- [ ] **Step 4: Verify dark renders** → console: `document.documentElement.setAttribute('data-theme','dark')` → the panel, tabs, cards, switches, readout, and op-range all turn dark with the spec palette. Remove the attribute → back to light.
- [ ] **Step 5: Commit**

```bash
git add public/style.css
git commit -m "refactor(theme): point #156 refined-light rules at tokens"
```

### Task 4: Rail treatment A + SVG icons + active state + gap fix (atomic)

The rail turns light **and** the icons become inline SVG in one task — the old PNG glyphs are light-on-dark and would vanish on a light rail.

**Files:** Modify `public/index.html` (the `#mapcontrols` block, 218-227; add an SVG sprite just inside `<body>` ~line 93) and `public/style.css` (rail rules).

- [ ] **Step 1: Add the hidden SVG sprite** (just inside `<body>`, before `#mapcontrols`):

```html
<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <symbol id="ico-identify" viewBox="0 0 24 24"><path d="M5 3 L11.5 19 L13.7 12.3 L20 10 Z"/></symbol>
  <symbol id="ico-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><line x1="16.2" y1="16.2" x2="21" y2="21"/></symbol>
  <symbol id="ico-pin" viewBox="0 0 24 24"><path d="M12 21 C12 21 19 14.5 19 9 A7 7 0 1 0 5 9 C5 14.5 12 21 12 21 Z"/><circle cx="12" cy="9" r="2.4"/></symbol>
  <symbol id="ico-layers" viewBox="0 0 24 24"><path d="M12 3 L21 8 L12 13 L3 8 Z"/><path d="M3 13 L12 18 L21 13"/></symbol>
  <symbol id="ico-gear" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/></symbol>
  <symbol id="ico-unit" viewBox="0 0 24 24"><circle cx="10" cy="10" r="6"/><line x1="14.2" y1="14.2" x2="20" y2="20"/><line x1="8" y1="9" x2="12" y2="9"/><line x1="8" y1="11.5" x2="11" y2="11.5"/></symbol>
  <symbol id="ico-sun" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.3M12 19.2v2.3M2.5 12h2.3M19.2 12h2.3M5 5l1.6 1.6M17.4 17.4l1.6 1.6M19 5l-1.6 1.6M6.6 17.4 5 19"/></symbol>
  <symbol id="ico-moon" viewBox="0 0 24 24"><path d="M20 14.5 A8 8 0 1 1 9.5 4 A6.5 6.5 0 0 0 20 14.5 Z"/></symbol>
</svg>
```

- [ ] **Step 2: Put an SVG into each rail button** — edit the `#mapcontrols` anchors (218-227). Remove `theme-color` from `#mapcontrols` and each `<a>`; insert a `<svg>` child. Result:

```html
<div id="mapcontrols" class="leaflet-bar leaflet-control leaflet-right">
    <a id="identify-button" class="identify tooltip left" href="#" data-title="Click Options"><svg class="rail-ico"><use href="#ico-identify"/></svg></a>
    <a id="search" class="search tooltip left" href="#" data-title="Search For Maps"><svg class="rail-ico"><use href="#ico-search"/></svg></a>
    <a id="geocoder-button" class="geocoder tooltip left" href="#" data-title="Go To a Location"><svg class="rail-ico"><use href="#ico-pin"/></svg></a>
    <a id="layers-button" class="layers tooltip left rightbarExpanded" href="#" data-title="Map Layer Controls"><svg class="rail-ico"><use href="#ico-layers"/></svg></a>
    <a id="config-button" class="configuration tooltip left" href="#" data-title="Map Config Controls"><svg class="rail-ico"><use href="#ico-gear"/></svg></a>
    <a id="srchunits-button" class="searchunits tooltip left" href="#" data-title="Search Geologic Units"><svg class="rail-ico"><use href="#ico-unit"/></svg></a>
</div>
```

(Drop the trailing empty `<div></div>`. Keep all ids/classes/handlers. Note: `layers-button` carries `rightbarExpanded` in source but JS syncs it on load; leave as-is.)

- [ ] **Step 3: Add the rail CSS** (append near the existing `.leaflet-right`/icon rules, ~210-276; these new id-scoped rules override the old class rules):

```css
/* ===== Right rail — Refined Light (treatment A), themed ===== */
#mapcontrols {
  top: 0; right: 0; position: absolute;
  display: flex; flex-direction: column;
  width: 46px; margin: 5px; padding: 0;
  background: var(--rail-bg);
  border: 1px solid var(--rail-border);
  border-radius: 9px;
  box-shadow: var(--shadow);
  overflow: hidden;
}
#mapcontrols a {
  position: static;
  width: 100%; height: 44px;
  display: flex; align-items: center; justify-content: center;
  color: var(--rail-glyph);
  background: none;
  border: none;
  border-bottom: 1px solid var(--divider);
  border-radius: 0;
}
#mapcontrols a:last-of-type { border-bottom: none; }
#mapcontrols a:hover { background: var(--card-hover); }
#mapcontrols a.rightbarExpanded { background: var(--rail-active-bg); color: var(--rail-active-glyph); }
#mapcontrols .rail-ico { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 1.9; stroke-linecap: round; stroke-linejoin: round; }
```

- [ ] **Step 4: Brace balance** → `BALANCED`.
- [ ] **Step 5: Verify** → open `public/index.html`: the rail is a light rounded strip, six contiguous SVG icons (no gap), hover greys, and opening a panel paints that button accent (`rightbarExpanded`). Toggle dark in console → rail goes slate, glyphs light, active = `#6396fc`. Confirm tooltips and the `.survey` "Give Feedback" tab still sit correctly; check mobile width.
- [ ] **Step 6: Commit**

```bash
git add public/index.html public/style.css
git commit -m "feat(rail): refined-light strip with svg icons + active state"
```

### Task 5: Theme toggle button (rail bottom) + handler + persistence

**Files:** Modify `public/index.html` (append a toggle anchor to `#mapcontrols`), `public/style.css` (toggle styles), `public/mapcontrols.js` (handler near ~1525).

- [ ] **Step 1: Add the toggle button** as the last child of `#mapcontrols`:

```html
    <a id="theme-toggle" class="theme-toggle tooltip left" href="#" data-title="Toggle Light / Dark"><svg class="rail-ico ico-moon"><use href="#ico-moon"/></svg><svg class="rail-ico ico-sun"><use href="#ico-sun"/></svg></a>
```

- [ ] **Step 2: Add toggle CSS:**

```css
#mapcontrols #theme-toggle { border-top: 2px solid var(--divider); }
#theme-toggle .ico-sun { display: none; }
:root[data-theme="dark"] #theme-toggle .ico-sun { display: block; }
:root[data-theme="dark"] #theme-toggle .ico-moon { display: none; }
```

- [ ] **Step 3: Add the handler** in `public/mapcontrols.js`, right after the `$(".search").click(...)` block (~line 1525):

```js
// ===== Theme (light / dark) toggle =====
var THEME_KEY = 'ugsMapTheme';
function toggleTheme() {
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (dark) { document.documentElement.removeAttribute('data-theme'); }
    else { document.documentElement.setAttribute('data-theme', 'dark'); }
    try { localStorage.setItem(THEME_KEY, dark ? 'light' : 'dark'); } catch (e) { /* private mode */ }
}
$("#theme-toggle").click(function (e) { e.preventDefault(); toggleTheme(); });
```

- [ ] **Step 4: Verify JS** → `node --check public/mapcontrols.js` → no output.
- [ ] **Step 5: Verify behavior** → open `public/index.html`: the moon sits at the rail bottom; click → whole app (rail, panel, flyouts) goes dark and the icon becomes a sun; reload → stays dark (persisted); click → back to light; `localStorage.removeItem('ugsMapTheme')` + reload → light (default).
- [ ] **Step 6: Commit**

```bash
git add public/index.html public/style.css public/mapcontrols.js
git commit -m "feat(theme): rail-bottom light/dark toggle with persistence"
```

### Task 6: Search + Geocoder flyouts — Refined-Light shell + themed Esri widget

**Files:** Modify `public/index.html` (remove `theme-color` from `#searchPanel` 247, `#geocoderPanel` 250; add a compact header) and `public/style.css` (`#searchPanel` 319-328, `#geocoderPanel` 549-577, plus `.esri-search` internals 564-577).

- [ ] **Step 1: Markup** — drop `theme-color`, add a header above the widget:

```html
<div id="searchPanel" class="hidden hide-mobile">
    <div class="fly-head"><span class="fly-title">Search maps</span></div>
    <div id="search-esri"></div>
</div>
<div id="geocoderPanel" class="hidden hide-mobile">
    <div class="fly-head"><span class="fly-title">Go to a location</span></div>
    <div id="geocoder"></div>
</div>
```

- [ ] **Step 2: Flyout shell + Esri theming CSS** (replace the bodies of `#searchPanel` and `#geocoderPanel`; add the shared shell rules):

```css
/* ===== Refined-Light flyouts (shared shell) ===== */
#searchPanel, #geocoderPanel {
  position: absolute; right: 54px; z-index: 999; width: 230px;
  padding: 9px 10px 11px; margin: 0;
  background: var(--flyout); border: 1px solid var(--border);
  border-radius: 7px; box-shadow: var(--shadow-lift);
}
#searchPanel { top: 46px; }
#geocoderPanel { top: 138px; }
.fly-head { margin: 0 0 8px; }
.fly-title { font-family: "Bebas Neue Regular", Verdana, sans-serif; font-size: 14px; letter-spacing: .6px; color: var(--title); }
/* caret to the active rail button */
#searchPanel::after, #geocoderPanel::after {
  content: ""; position: absolute; right: -7px; top: 14px;
  border-top: 7px solid transparent; border-bottom: 7px solid transparent;
  border-left: 7px solid var(--flyout);
}
/* Esri Search widget */
.esri-search { width: 208px !important; }
.esri-search .esri-search__input,
.esri-search .esri-input {
  background: var(--field); color: var(--field-text);
  border: 1px solid var(--field-border); border-radius: 6px;
}
.esri-search .esri-search__input::placeholder { color: var(--muted); }
.esri-search .esri-search__submit-button,
.esri-search .esri-search-button {
  background: var(--field); color: var(--field-text); border-color: var(--field-border);
}
.esri-search .esri-menu,
.esri-search .esri-search__suggestions-menu {
  background: var(--flyout); color: var(--text); border-color: var(--border);
}
```

(Delete/override the old `#searchPanel`/`#geocoderPanel` and `.esri-search*` blocks at 319-328, 549-577. Keep `#search-esri`/`#geocoder` ids — the JS focus calls at mapcontrols.js ~1497/1521 depend on `.esri-search__input` inside them.)

- [ ] **Step 3: Brace balance** → `BALANCED`.
- [ ] **Step 4: Verify** → open `public/index.html`: click Search and Geocoder; each is a white card with a Bebas title + caret, a legible input, and a working Esri search/suggestions; toggle dark → both themed, input still readable; the rail button shows its active state while open.
- [ ] **Step 5: Commit**

```bash
git add public/index.html public/style.css
git commit -m "feat(flyouts): refined-light search + geocoder, themed esri widget"
```

### Task 7: Milestone 1 review checkpoint

- [ ] **Step 1:** Launch a code-review subagent on the M1 diff (`git diff feat/unified-map-panel...HEAD`). Brief it: what changed (token system + #156 refactor + rail A + toggle + search/geocoder), why, the spec path, and that `node --check` + brace-balance pass. Address every finding in this pass.
- [ ] **Step 2:** Push and verify on the preview (see Task 10's matrix, M1 rows). If M2 is being cut to a fast-follow, stop here and open the PR (Task 10).

---

# Milestone 2 — Config + Unit-search flyouts

### Task 8: Config flyout (`#configPanel`) restyle

**Files:** `public/index.html` (259-317) and `public/style.css` (622-652).

- [ ] **Step 1: Markup** — remove `theme-color`; replace `.layer-panel-title` with `.fly-head`; turn the two boolean checkboxes (`#exagelevation`, `#baseblend`) into `.layer-switch` rows; keep all ids/handlers. Example for the title + one switch row:

```html
<div id="configPanel" class="hidden">
    <div class="fly-head"><span class="fly-title">Map configuration</span></div>
    <a id="config-close" class="close" data-title="Close"></a>
    ...
    <div class="map-layer cfg-row">
        <label class="layer-switch"><span class="cfg-name">Basemap blending</span>
          <input type="checkbox" class="list_item" value="0" id="baseblend" checked='checked'>
          <span class="layer-switch-slider"></span></label>
    </div>
```

- [ ] **Step 2: CSS** — theme the panel + its controls:

```css
#configPanel {
  position: absolute; top: 230px; right: 54px; width: 230px;
  padding: 9px 10px 14px; border-radius: 7px; z-index: 1;
  background: var(--flyout); border: 1px solid var(--border);
  box-shadow: var(--shadow-lift); color: var(--text);
  font-family: 'Corbel Regular', sans-serif;
}
#configPanel p, #configPanel .cfg-name { color: var(--text); }
#configPanel select, #configPanel input[type="text"] {
  background: var(--field); color: var(--field-text); border: 1px solid var(--field-border); border-radius: 6px;
}
#configPanel .lnk { color: var(--title-strong); }
#configPanel .cfg-row { background: var(--card); border: 1px solid var(--border); border-radius: 5px; padding: 6px 9px; margin: 0 0 6px; }
```

(Delete the old `#configPanel`, `#configPanel p` blocks at 622-652.)

- [ ] **Step 3: Brace balance** → `BALANCED`. **Step 4: Verify** → open Config in both themes; the basemap `<select>`, coordinate-format radios, the two toggles, and 2D/3D links are themed and still function (changing the basemap still works). **Step 5: Commit** `feat(flyouts): refined-light config panel`.

### Task 9: Unit-search flyout (`#unitsrchPanel`) restyle

**Files:** `public/index.html` (319-355) and `public/style.css` (669-682).

- [ ] **Step 1: Markup** — remove `theme-color`; `.layer-panel-title` → `.fly-head`; keep the unit/age radios, `#limitUnitSearch`, the note, and the export form (`#exportmap`, `#simplify`) with their ids/handlers.
- [ ] **Step 2: CSS:**

```css
#unitsrchPanel {
  position: absolute; top: 280px; right: 54px; width: 230px;
  padding: 9px 10px 14px; border-radius: 7px; z-index: 1;
  background: var(--flyout); border: 1px solid var(--border);
  box-shadow: var(--shadow-lift); color: var(--text);
  font-family: 'Corbel Regular', sans-serif;
}
#unitsrchPanel .srchnote { color: var(--muted); }
#unitsrchPanel select, #unitsrchPanel input[type="button"] {
  background: var(--field); color: var(--field-text); border: 1px solid var(--field-border); border-radius: 6px;
}
```

(Delete the old `#unitsrchPanel` block at 669-682. The shared `.fly-head`/`.fly-title` from Task 6 styles the header.)

- [ ] **Step 3: Brace balance** → `BALANCED`. **Step 4: Verify** → open Unit search in both themes; radios, the note, and the export form are themed and still function. **Step 5: Commit** `feat(flyouts): refined-light unit-search panel`.

---

### Task 10: Final verification, review, push, PR

- [ ] **Step 1:** `node --check public/mapcontrols.js` → clean; CSS brace command → `BALANCED`.
- [ ] **Step 2:** Code-review subagent on the full branch diff (if M2 landed after the M1 review); address findings.
- [ ] **Step 3:** Push `feat/right-rail-and-theme`; open a PR **based on `feat/unified-map-panel`** (stacked on #156), Conventional-Commits title (e.g. `feat: right-rail refined-light restyle + app-wide dark mode`), body noting the stack and which reviewer(s) ran.
- [ ] **Step 4: Manual test matrix on the preview:**
  - Toggle flips the whole chrome (rail, flyouts, panel, readout) in one click; persists across reload; first-ever load is light; stored-dark reload doesn't flash light.
  - Rail: six contiguous tools, no gap; hover; active state when a panel is open; tooltips + `.survey` tab + 3D + mobile intact.
  - Flyouts: Search, Geocoder, Config, Unit-search all themed in both modes; Esri widgets legible/functional; all controls still work.
  - #156 surfaces unchanged in light mode.
  - No console errors; mobile bottom sheet fine.

---

## Self-review

- **Spec coverage:** tokens (T1) ✓; `data-theme`/anti-FOUC (T2) ✓; #156 refactor (T3) ✓; rail A + SVG icons + active state + gap fix (T4) ✓; persisted toggle (T5) ✓; Search/Geocoder (T6) ✓; Config/Unit-search (T8-9) ✓; review + preview (T7, T10) ✓. Deferred items (basemap switcher, left bar, reference-into-basemap) correctly absent.
- **Placeholders:** none — every code step shows the code; the refactor is a fully-specified mapping + ranges.
- **Type/name consistency:** `THEME_KEY='ugsMapTheme'` and the `data-theme` attribute match the inline script (T2) and handler (T5); sprite ids `#ico-*` defined in T4 are referenced in T4/T5; `.fly-head`/`.fly-title` defined in T6 reused in T8-9; `.rail-ico` defined in T4 reused by the toggle in T5.
- **Atomicity risk handled:** rail-light + SVG icons combined (T4) so glyphs never vanish.
