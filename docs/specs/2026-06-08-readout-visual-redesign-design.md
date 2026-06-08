# Readout Visual Redesign ("Refined Light") — Design Spec

**Date:** 2026-06-08
**Status:** Approved in brainstorm (visual companion, Direction A); pending spec review.
**Branch:** `feat/readout-redesign` (off `feat/consolidated-readout-panel` / PR #151).

## Goal

An eye-catching but professional **visual polish** of the click-readout panel
(already built in #151) in the "Refined Light" direction: stronger header, crisp
colored iconography, clearer hierarchy, visible-but-muted grayed chips, more
breathing room. **Look-and-feel only** — no structural or behavioral change.

## Scope

- **In:** the readout panel's visual styling (`public/style.css` `.readout-*` /
  `.res-*` / `#unitsPane`) and the resource-chip iconography in
  `public/mapcontrols.js` (`renderResources`).
- **Out (separate efforts, do not touch here):** the dark theme, Map Downloads
  card removal, layer-list / tools reorg. **No new libraries, no build step.**

## Approved direction — "Refined Light"

Light panel (white, opacity ~0.96–1 for crisp text), a tightened UGS-blue accent
system:

- Title / header text: deeper blue `#235c87` (Bebas Neue).
- Accent + icons: `#326A98`.
- Toggle "on": `#6396fc`.
- Body: `#2a2a2a`; description `#3c3c3c`; muted labels `#9aa0a6`; grayed `#8d8d8d`.
- Hairlines `#ededed`; tool/copy chips `#f4f7fb` bg / `#cdd8e3` border / `#235c87` text.

## Concrete changes

### 1. Header (`.readout-primary-head`, `.map-section-header`)
- Primary title in `#235c87`, Bebas ~18.5px.
- A short **accent bar** under the primary header: 2px `#326A98`, ~54px wide,
  left-aligned (via `::after`) sitting on the existing hairline.
- Keep the title-row layer toggle (right), sticky header, and close-button clearance.

### 2. Iconography — replace the faint PNG glyphs with inline SVG
- The legacy `.pdfIcon/.gisIcon/.tiffIcon/.xsecIcon/.purIcon` background-PNGs (the
  ones that were too light/small) are replaced by **inline SVG** icons emitted in
  `renderResources`, ~20px, drawn with `currentColor` so the chip's color drives them:
  - PDF → document · GIS data → layers · GeoTIFF → image · Cross-section → section
    wave · Lithologic column → stacked bars · Purchase → cart.
- Chip becomes a flex row: `svg` + label. Active = `#326A98`; **grayed**
  (`.res-chip-off`) = `filter: grayscale(1); opacity: .55` + `#8d8d8d` text — clearly
  unavailable but legible, keeping the existing "Not available for this map" tooltip.
- Implementation: a small `RES_ICONS` map (type → inline SVG string) in
  `mapcontrols.js`; the chip builder picks the icon by type. No dependency added.

### 3. Hierarchy & spacing
- Unit identity: symbol accented (e.g. `Qal` in `#326A98`), name bold, age muted gray.
- A small uppercase **"Resources"** label (`#9aa0a6`, letter-spacing) above the grid.
- More vertical breathing room between blocks (description → resources → DOI →
  citation → tools) with subtle hairlines.

### 4. Preserved exactly (no change)
Single-column layout; the consistent six-type resource grid + grayed-when-absent
logic; the **written-out DOI above the citation** (`buildPubLink`; non-UGS stays a
plain "Publication Page" hyperlink); the visible "Copy" citation button; the
click-anywhere / Esc image viewer; the title-row toggle (with click
`stopPropagation`); the description clamp + Show more; the empty-state that still
renders a map's resources when no unit sits under the click.

## Implementation notes

- Mostly `public/style.css`; one focused `renderResources` change to emit SVG chips.
- After edits: `node --check public/mapcontrols.js`; confirm `style.css` braces balance.
- The real look is verified on the **preview channel** (build → push → review on the
  PR), not in the companion. Build happens on `feat/readout-redesign`.

## Testing (manual — no frontend test runner)

On the preview channel: desktop + mobile (bottom sheet); a unit map (M-249), a
no-unit / pub-only map (MP-17-2DM), and a non-UGS map (shows "Publication Page").
Confirm: icons are crisp + colored; grayed chips legible; header accent + hierarchy
read well; DOI / citation / tools all intact; sticky header + toggle unaffected.

## Out of scope / risks

- Do not drift into the card removal or layer-list reorg.
- SVG icons must read clearly at ~20px and in grayscale; tune the paths against the
  dev preview.

## Self-review

- **Placeholders:** none.
- **Consistency:** the blue palette and the preserved-list match the approved mockup.
- **Scope:** focused on the readout's visual layer; the two structural pieces are
  explicitly deferred to their own specs.
- **Ambiguity:** the icon set is enumerated per resource type; colors are concrete hex.
