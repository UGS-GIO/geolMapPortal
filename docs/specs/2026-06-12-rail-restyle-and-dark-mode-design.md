# Right-rail restyle + app-wide dark mode — Design Spec

**Date:** 2026-06-12
**Status:** Approved in brainstorm (visual companion: rail treatment "A", dark palette, rail-bottom toggle); pending spec review.
**Branch:** stacks on `feat/unified-map-panel` (PR #156) — see *Branch / PR* below.

## Goal

Two coupled pieces:

1. **Restyle the right-rail tools to "Refined Light"** — bring the dark
   `theme-color #565656` rail and its flyouts into the design language already
   shipped in the unified Map panel (#156). The rail becomes treatment **A**: a
   light card-style strip.
2. **Introduce an app-wide light/dark theme** — a manual, persisted toggle
   (default light) that swaps the whole Refined-Light chrome (rail, flyouts,
   unified Map panel / readout / Layers) between a light and a dark palette,
   built on CSS custom properties.

These ship together because a clean theme swap requires refactoring the existing
hardcoded-hex Refined-Light CSS onto variables anyway.

## Decisions locked in the brainstorm (visual companion)

- **Rail look:** treatment **A** — a light strip styled like the panel cards
  (`#f5f6f8` fill, `#e3e3e3` border, hover `#eceff4`), active tool = accent fill.
- **Dark-mode scope:** whole app *chrome* — rail + flyouts + the unified Map
  panel / readout / Layers. (Map imagery itself is not themed; the basemap stays
  whatever the user selected.)
- **Trigger:** a manual toggle, choice remembered in `localStorage`, default
  **light**.
- **Toggle home:** the bottom of the rail (a sun/moon control, divider above).
- **Icons:** the rail/flyout/close icons become inline **SVG** so `currentColor`
  recolors them across themes for free (no per-theme PNG filters).
- **Dark palette:** deep-slate panels, elevated cards, off-white text, accent
  brightened to `#6396fc`. Full token table below.

## Architecture — the theme system

### Tokens (CSS custom properties)

Define the light values on `:root`; override on `:root[data-theme="dark"]`. The
**light values equal the current hardcoded hex** (consolidating a few
near-identical grays), so the #156 surfaces render **pixel-unchanged** in light
mode after the refactor — that is a correctness requirement, not an aspiration.

| Role | Variable | Light (current value) | Dark (new) |
|---|---|---|---|
| Panel / flyout bg | `--panel` / `--flyout` | `#ffffff` | `#1f262e` / `#222a33` |
| Card bg | `--card` | `#f5f6f8` | `#2a323c` |
| Card open/elevated | `--card-open` | `#ffffff` | `#323d49` |
| Card hover | `--card-hover` | `#eceff4` | `#333d49` |
| Border | `--border` | `#e3e3e3` | `#3a434e` |
| Border (open) | `--border-open` | `#d4dde7` | `#46566a` |
| Divider / hairline | `--divider` | `#ededed` | `rgba(255,255,255,.07)` |
| Body / row text | `--text` | `#4a4a4a` | `#dde3e9` |
| Muted / labels | `--muted` | `#9a9a9a` | `#8b95a0` |
| Soft muted | `--muted-soft` | `#7a8794` | `#8b95a0` |
| Title / primary | `--title` | `#235c87` | `#86b8ea` |
| Title strong / accent text | `--title-strong` | `#326A98` | `#9cc6f0` |
| Accent (icons, focus, bars) | `--accent` | `#326A98` | `#6396fc` |
| Toggle-on | `--accent-on` | `#6396fc` | `#6ea0ff` |
| Switch off track | `--switch-off` | `#c6c6c6` | `#4a535e` |
| Chevron | `--chevron` | `#9aa3ad` | `#7d8893` |
| Tab bg / text | `--tab-bg` / `--tab-text` | `#f7f9fc` / `#7a8794` | `#222a33` / `#8b95a0` |
| Tab selected bg / text | `--tab-sel-bg` / `--tab-sel-text` | `#ffffff` / `#235c87` | `#2a323c` / `#cfe0f2` |
| Tab underline | `--tab-underline` | `#326A98` | `#6396fc` |
| Rail bg / border | `--rail-bg` / `--rail-border` | `#f5f6f8` / `#e3e3e3` | `#252d36` / `#333d49` |
| Rail glyph | `--rail-glyph` | `#54585c` | `#cdd4db` |
| Rail active bg / glyph | `--rail-active-bg` / `--rail-active-glyph` | `#326A98` / `#fff` | `#6396fc` / `#fff` |
| Field bg / border / text | `--field` / `--field-border` / `--field-text` | `#ffffff` / `#e3e3e3` / `#444` | `#1a2027` / `#3a434e` / `#dde3e9` |
| Shadow / lifted shadow | `--shadow` / `--shadow-lift` | `0 1px 5px rgba(50,106,152,.12)` / `0 4px 16px rgba(40,60,80,.16)` | `0 2px 10px rgba(0,0,0,.45)` / `0 6px 20px rgba(0,0,0,.5)` |

### Wiring

- `data-theme` lives on `<html>` (`document.documentElement`). Absent = light;
  `"dark"` = dark.
- **Anti-FOUC:** a tiny inline script at the very top of `<head>` (before the
  stylesheet paints) reads `localStorage['ugsMapTheme']` and, if `"dark"`, sets
  `document.documentElement.dataset.theme = 'dark'`. This prevents a returning
  dark-mode user from flashing light.
- **Toggle:** a sun/moon button at the bottom of the rail. Click flips
  `documentElement.dataset.theme` and writes `localStorage['ugsMapTheme']`
  (`'light'`/`'dark'`), mirroring the existing `PANEL_STATE_KEY = 'ugsMapPanel'`
  persistence pattern (mapcontrols.js ~738). Separate key (`ugsMapTheme`).
- **Refactor:** the existing #156 Refined-Light rule blocks (`#unitsPane`,
  `.panel-tabs`/`.panel-tab`, `#unitsPane #layersPanel …`, `.lyr-group`,
  `.map-section*`, `.layer-switch*`, `.op-range`, `.readout-*`, `.other-maps-label`,
  the footprint badges, `#displayGroup`) are rewritten to reference the variables
  instead of literal hex.

## The rail (treatment A)

- `#mapcontrols` becomes a themed light strip: `var(--rail-bg)` fill,
  `1px solid var(--rail-border)`, `border-radius`, `var(--shadow)`. **Remove the
  `theme-color` class** from `#mapcontrols` and each rail `<a>` (do not touch the
  global `.theme-color` rule — it is shared with other widgets).
- **Buttons:** glyph `var(--rail-glyph)`; hover `var(--card-hover)`; hairline
  `var(--divider)`. **Active** (open panel) `.rightbarExpanded` →
  `var(--rail-active-bg)` fill + `var(--rail-active-glyph)` glyph. (Today
  `.rightbarExpanded` has no visual — this adds it, replacing the dead
  commented `.searchExpanded`/`.opExpanded`/etc. block.)
- **Icons → inline SVG.** Add a hidden `<svg>` sprite (6 symbols: identify,
  search, geocoder/locate, layers, config/scale, unit-search) and a `<use>` in
  each button; glyph paint = `currentColor`. Removes the PNG background-images
  for these six.
- **Close the opacity gap.** The buttons are currently absolutely positioned by
  hardcoded `top:` (leaving a 45px hole at `top:92px` where the removed opacity
  icon was). Convert `#mapcontrols` to a **flex column** so the six tools stack
  contiguously; drop the per-button `top`/`right`. (Watch: the `.survey` "Give
  Feedback" tab, tooltips, and mobile — verify unaffected.)
- **Theme toggle** appended after the tools with a `border-top: 2px var(--divider)`
  divider; sun (in dark) / moon (in light) SVG.

## The flyouts (Refined Light + themed)

A shared flyout shell: `var(--flyout)` card, `border-radius`, `var(--shadow-lift)`,
a **compact Bebas header** (`var(--title)`, not the old 24px underlined
`.layer-panel-title`) + an SVG close, and a small caret pointing to the active
rail button. Remove `theme-color` from each panel.

- **Search** (`#searchPanel` → `#search-esri`) and **Geocoder**
  (`#geocoderPanel` → `#geocoder`): theme the Esri Search widget internals
  (`.esri-search`, `.esri-input`, `.esri-search-button`) via the field/accent
  variables; restyle the shell.
- **Config** (`#configPanel`): themed shell + header; the basemap `<select>`,
  coordinate-format radios, and the 2D/3D links restyled to themed controls; the
  *exaggeration* and *basemap-blending* checkboxes become `.layer-switch-slider`
  switches for consistency.
- **Unit search** (`#unitsrchPanel`): themed shell + header; the unit/age search
  radios, "redraw on pan" checkbox, the note text, and the GeoJSON export form
  (`#exportmap`, `#simplify`) restyled to themed controls.

## Branch / PR

This is materially larger than "restyle the right-rail tools." Folding an
app-wide dark mode into #156 (awaiting preview sign-off + bottom-up merge) would
bloat that PR and complicate its review. **Stack this on a new branch off
`feat/unified-map-panel`** (e.g. `feat/right-rail-and-theme`) as its own PR,
keeping #156 independently mergeable. (The handoff explicitly allows "a branch
off it.")

## Recommended phasing

The theme system is most of the value and the riskiest refactor; the dense
utility flyouts are the most mechanical. Recommended single PR, but splittable:

- **Core (this PR):** theme tokens (light+dark) + `data-theme` + anti-FOUC
  script + persisted rail-bottom toggle; refactor the #156 Refined-Light
  surfaces onto variables; rail treatment A (SVG icons, active state, gap fix);
  Search + Geocoder flyouts fully restyled + themed.
- **Same PR if appetite allows, else fast-follow PR2:** Config + Unit-search
  flyout content restyle. *If split, those two panels keep their current dark
  `theme-color` until PR2* — an acknowledged temporary inconsistency in light
  mode. (Decide at spec review.)
- **Out of scope / deferred:** basemap switcher visual restyle (its own mock per
  the handoff; the theme vars will cover it cheaply later) and the
  reference-layers-into-basemap question; the left zoom/tilt bar + bottom-left
  links dark theming (PNG-glyph rework — noted for full light-mode consistency);
  strat/help popovers.

## Preserved exactly

All behavior and wiring: panel-state persistence, the layer toggles /
`setLayerVisibility` / readout↔checkbox sync / URL layer-state, footprints, the
readout content, and every flyout's *function* (the Esri search/geocode, config
options, unit search + export). This change is CSS + the new theme
attribute/toggle + the rail icon markup swap. No new libraries, no build step.

## Watch-items / risks

- **`theme-color` is shared** with `#xsection-pane`, `#nav-guide`, `#mapHelp`,
  and the left bar. Do **not** redefine `.theme-color` globally — remove it from
  the rail + flyouts and theme those surfaces specifically.
- **Light-mode parity:** the variable refactor must leave the #156 surfaces
  visually identical in light mode. Verify the readout/Layers/tabs side-by-side
  against `feat/unified-map-panel` before/after.
- **FOUC:** without the inline `<head>` script, returning dark users flash light.
- **Rail reflow:** moving buttons from absolute `top:` to flex must not disturb
  the `.survey` tab, tooltips, or the mobile layout.
- **`#identify-button`** may be vestigial post-#155 (per the handoff) — verify
  what it does before restyling; keep or hide it consistently, don't break its
  handler.
- **Esri widget theming:** Esri's own CSS may override; test input focus/hover
  and the search dropdown in *both* themes.
- **Dark contrast:** confirm text/accent on slate meets reasonable contrast
  (WCAG AA-ish) — adjust `--text`/`--title` if needed.
- Keep `localStorage` key `ugsMapTheme` separate from `ugsMapPanel`.

## Testing (manual — no test runner; verify on the PR preview)

- Toggle flips the entire chrome (rail, flyouts, panel, readout) in one click;
  choice persists across reload; first-ever load is light; a stored-dark reload
  does not flash light.
- Rail: active tool shows the accent state when its panel is open; hover reads;
  the opacity gap is gone (six contiguous tools); tooltips + `.survey` tab + the
  3D/mobile layouts still work.
- Flyouts: Search + Geocoder (and Config + Unit-search if in this PR) are themed
  in both modes; the Esri widgets are legible and functional in both.
- #156 surfaces look unchanged in light mode.
- No console errors; mobile bottom-sheet still fine.

## Self-review

- **Placeholders:** none.
- **Consistency:** light token values match the existing #156 hex (light mode is
  visually neutral); dark values come from the approved palette mock.
- **Scope:** rail (A) + theme system + flyouts; basemap switcher, left bar, and
  reference-into-basemap explicitly deferred.
- **Ambiguity:** the one open call is the phasing (Config/Unit-search in this PR
  vs a fast-follow) — flagged for the spec review.
