# Backfill: `show_unit_desc = true`

Generated from `geolmap_portal_delineation.csv` (column `Unit Description Source ==
"Published GIS Database"`) and reconciled against the live footprints layer
`Geologic_Map_Footprints_View/FeatureServer/0` on 2026-05-29.

**Rule:** set `show_unit_desc = true` on these 60 maps. Every other footprint stays
unset/null and hides its descriptions (default-hide). These are the maps whose unit
descriptions came from the published GIS attribute table.

All 60 CSV maps matched a footprint feature: 51 exact, 9 differing only in case. The IDs
below use the **footprint layer's exact spelling** (what you edit), so they are
copy-paste ready.

## How to apply (AGOL)

1. Add a Boolean field `show_unit_desc` to the source hosted feature layer (the view
   inherits it). If a true Boolean type isn't available, use a String field with values
   `'True'`/`'False'` to match the existing `units` field — the portal code accepts
   boolean, integer `1`, or `'True'`.
2. In the layer's data table (or ArcGIS Pro), Select By Attributes with the WHERE clause
   below, then Calculate `show_unit_desc = true` on the selection.
3. Verify one map returns the field:
   `.../FeatureServer/0/query?where=series_id%3D%27M-300DM%27&outFields=series_id,show_unit_desc&f=json`

### WHERE clause

```sql
series_id IN ('M-127DR','M-216DM','M-278DM','M-279DM','M-280DM','M-281DM','M-282DM','M-283DM','M-284DM','M-285DM','M-286DM','M-287DM','M-288DM','M-289DM','M-290DR','M-291DR','M-292DM','M-293DR','M-294DM','M-295DM','M-296DM','M-297DM','M-298DM','M-299DM','M-300DM','M-301DR','M-302DM','MP-171DM','MP-173DM','MP-175DM','MP-18-2DM','OFR-549dm','OFR-653dm','OFR-671dm','OFR-672dm','OFR-673dm','OFR-674DM','OFR-675DM','OFR-678dm','OFR-679DM','OFR-680DM','OFR-681DM','OFR-682DM','OFR-683DM','OFR-686DM','OFR-690dm','OFR-698DR','OFR-710DR','OFR-711DR','OFR-713DR','OFR-716dm','OFR-717DR','OFR-729DM','OFR-734DM','OFR-752DM','OFR-753DR','OFR-768DM','OFR-770DM','OFR-771DM','OFR-772DM')
```

> Note: `series_id` matching may be case-sensitive depending on the workspace. The clause
> above already uses the footprint spellings. If your editing environment is
> case-insensitive, the 9 case-only differences below collapse automatically.

## Reconciliation (9 case-only differences — already resolved above)

| CSV `Series ID` | Footprint `series_id` (use this) |
|---|---|
| M-302dm | M-302DM |
| OFR-549DM | OFR-549dm |
| OFR-653DM | OFR-653dm |
| OFR-671DM | OFR-671dm |
| OFR-672DM | OFR-672dm |
| OFR-673DM | OFR-673dm |
| OFR-678DM | OFR-678dm |
| OFR-690DM | OFR-690dm |
| OFR-716DM | OFR-716dm |

## Full list (60, footprint spelling)

M-127DR, M-216DM, M-278DM, M-279DM, M-280DM, M-281DM, M-282DM, M-283DM, M-284DM,
M-285DM, M-286DM, M-287DM, M-288DM, M-289DM, M-290DR, M-291DR, M-292DM, M-293DR,
M-294DM, M-295DM, M-296DM, M-297DM, M-298DM, M-299DM, M-300DM, M-301DR, M-302DM,
MP-171DM, MP-173DM, MP-175DM, MP-18-2DM, OFR-549dm, OFR-653dm, OFR-671dm, OFR-672dm,
OFR-673dm, OFR-674DM, OFR-675DM, OFR-678dm, OFR-679DM, OFR-680DM, OFR-681DM, OFR-682DM,
OFR-683DM, OFR-686DM, OFR-690dm, OFR-698DR, OFR-710DR, OFR-711DR, OFR-713DR, OFR-716dm,
OFR-717DR, OFR-729DM, OFR-734DM, OFR-752DM, OFR-753DR, OFR-768DM, OFR-770DM, OFR-771DM,
OFR-772DM
