# geolMapPortal — PR review guide
Firebase-hosted geologic-map portal: multi-version ArcGIS (3.15 + 4.29) + Leaflet + jQuery/fancybox
front-end (public/), PHP data endpoints over MySQL, plus a Cloud Function ArcGIS token minter
(functions/). LEGACY / being retired per house rules — do the minimum. Review ONLY the changed lines
(general bug/security/quality assumed). Cite file:line; group nits; prefer minimal, in-style fixes
over refactors — no rewrites on retiring code.

## Match the existing code
- jQuery + mixed ArcGIS/Leaflet client + plain PHP. Match surrounding patterns; no new
  frameworks/build steps.

## Security (top priority — public app with server-side code + a DB)
- SQL injection is the #1 risk: any query built from request input (`$_GET`/`$_POST`) MUST bind
  parameters — never concatenate or interpolate request data into SQL text. Flag any changed query
  touching request input.
- No DB credentials in committed code: flag any hardcoded host/user/password, and any that a PR
  relocates rather than removes — credentials belong in env / Secret Manager.
- Keep the ArcGIS token minter server-side: it mints referer-scoped tokens against an allowlist.
  Don't weaken the allowlist / referer scoping or move the ArcGIS admin credential client-side.
- XSS / DOM injection: popups, tables, and fancybox content are built via `innerHTML` from
  feature/DB/URL data — escape any newly rendered untrusted value.

## Correctness
- Fail loud on failed PHP/WFS/query responses — don't emit empty JSON that silently blanks the UI.

## Review scope & severity
- Skip (don't post findings): vendored/minified bundles — `public/fancybox/`, `swiper-bundle.min.*`, `inobounce.min.js`, and the saved-page assets under `public/images/UGS Interactive Map Viewer 4.0beta_files/` — plus lockfiles (`package-lock.json`, `functions/package-lock.json`).
- Blocking here (not a nit): merge to `master` auto-deploys hosting + the Cloud Function to prod, so any new request-input-to-SQL path or committed credential is a blocker, not a nit.
