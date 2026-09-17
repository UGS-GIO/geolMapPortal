# geolMapPortal — PR review guide
Firebase-hosted geologic-map portal: multi-version ArcGIS (3.15 + 4.29) + Leaflet + jQuery/fancybox
front-end (public/), PHP data endpoints (mysqlMapData.php, connect.php) over MySQL, plus a Cloud
Function ArcGIS token minter (functions/index.js). LEGACY / being retired per house rules — do the
minimum. Review ONLY the changed lines (general bug/security/quality assumed). Cite file:line; group
nits; prefer minimal, in-style fixes over refactors — no rewrites on retiring code.

## Match the existing code
- jQuery + mixed ArcGIS/Leaflet client + plain PHP. Match surrounding patterns; no new
  frameworks/build steps.

## Security (top priority — public app with server-side code + a DB)
- SQL injection: mysqlMapData.php interpolates `$_GET['mapid']` into the query (line 28 → 53
  `WHERE series_id IN ($sid)`; also :85). `prepare()` runs AFTER interpolation, so it does NOT
  protect here — any changed query on request input must bind parameters, not concatenate. #1 catch.
- NO DB credentials committed: connect.php:3-5 holds host/user/password inline. Flag any new
  hardcoded cred, and any a PR relocates rather than removes.
- Keep the token minter server-side: getArcGISToken (functions/index.js:135) mints referer-scoped
  tokens against an ALLOWED_REFERERS allowlist (:159). Don't weaken the allowlist/referer scoping or
  move the ArcGIS admin credential client-side.
- XSS / DOM injection: popups, tables, and fancybox content are built via `innerHTML` from
  feature/DB/URL data — escape any newly rendered untrusted value.

## Correctness
- Fail loud on failed PHP/WFS/query responses — don't emit empty JSON that silently blanks the UI.
