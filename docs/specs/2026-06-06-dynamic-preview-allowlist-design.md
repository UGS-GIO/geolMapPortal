# Dynamic Preview-Channel Allowlist for Secured Layers — Design Spec

> **SUPERSEDED (2026-06-06).** This Firestore-based dynamic allowlist was built and
> validated, then removed as over-engineered. Preview-channel URLs live under the
> `ut-dnr-ugs-geolmapportal-dev--*.web.app` namespace, which only our own dev Firebase
> project can mint, so `getArcGISToken` now allows them with a single regex on the origin
> pattern — no Firestore, CI allowlist step, cleanup workflow, or `datastore.user` grant
> needed. Kept for historical rationale only.

**Date:** 2026-06-06
**Status:** Superseded — replaced by a regex referer check in `getArcGISToken`.
**Branch:** `feat/dynamic-preview-allowlist` (off `dev`).

## Goal

Every **open-PR** dev preview channel can load the secured ArcGIS layers —
automatically, with the referer allowlist staying **tight** (static origins +
only currently-open-PR channels) and **self-cleaning** (an entry is removed when
its PR closes). No per-PR prod function deploys, and the manual `readout-panel`
channel is retired.

## Background (current state)

- `getArcGISToken` (`functions/index.js`) mints a **referer-bound** ArcGIS token.
  It only binds the token to the caller's origin when that origin matches a
  hard-coded `ALLOWED_REFERERS` (geomap, prod/dev `.web.app`, localhost);
  otherwise it falls back to the prod referer (so secured layers don't load).
  Per-PR preview channels have unique URLs not in that list.
- Existing CI `firebase-hosting-pull-request.yml` already auto-deploys a **unique
  dev preview channel per PR** via `FirebaseExtended/action-hosting-deploy`,
  which exposes the channel URL as the step output `details_url`.
- `firebase-admin` is already initialized in the function (`admin.initializeApp()`).
  Firestore is **not yet** configured in the repo (`firebase.json` has only
  `functions` + `hosting`).
- A manual `readout-panel` channel is currently hard-coded in the *deployed* prod
  function as a stopgap; this design **retires** it.

## Design

### Store
A Firestore collection **`previewReferers`** in the **prod** project (where the
function runs), one document per open PR:
- doc id = PR number (e.g. `147`)
- fields: `{ url: <channel origin>, pr: <number>, updatedAt: <timestamp> }`

Doc-per-PR (vs a single array) so concurrent PRs don't contend, and **close
deletes by PR number** without needing to know the channel URL.

### Security rules
Add `firestore.rules` (and the `firestore` block in `firebase.json`) that
**deny all client reads/writes** (default-deny; `previewReferers` included). The
collection is read only by the function's runtime service account (server-side
Admin SDK, which bypasses rules) and written only by CI's prod service account.
No browser ever reads or writes it.

### Function (`getArcGISToken`)
- Static `ALLOWED_REFERERS` stays: `geomap.geology.utah.gov`,
  `…-(prod|dev).web.app`, `localhost`/`127.0.0.1`. **Remove** the `readout-panel`
  hard-code.
- Determine the bound referer:
  1. If the caller origin matches a static entry → bind to it (unchanged).
  2. Else read `previewReferers` docs, collect their `url`s; if the caller origin
     **exactly** matches one → bind to it.
  3. Else → fall back to the prod referer (no secured layers), as today.
- The function's existing `cors` allowlist already lets `…-dev--<channel>.web.app`
  origins call it — keep it.
- The Firestore read happens per token-mint, which is low-frequency (once per page
  session, after anonymous auth). An in-memory cache is a later optimization, not
  required.

### CI — add on PR open/update
Extend `firebase-hosting-pull-request.yml`:
- Give the deploy step an `id`.
- Add a step that writes `previewReferers/{PR_NUMBER} = { url: <details_url>, pr }`
  to **prod** Firestore, authenticated with the **prod** service account secret
  (`FIREBASE_SERVICE_ACCOUNT_UT_DNR_UGS_GEOLMAPPORTAL_PROD`). (The deploy step
  itself keeps using the dev SA; the Firestore write is a separate step with the
  prod SA.) The write uses a small `firebase-admin` Node script.

### CI — remove on PR close
New workflow on `pull_request: [closed]`:
- Delete `previewReferers/{PR_NUMBER}` from prod Firestore (prod SA). Keyed by PR
  number, so no channel URL is needed at close time.
- Optionally also delete the dev channel for tidiness.

## Security properties

At any moment, a valid origin-bound token (the thing that unlocks secured layers)
is grantable only to: the static origins (prod / dev / localhost) **plus** the
exact URLs of currently-open PRs' channels. Never a wildcard/pattern. The dynamic
entries are written only by CI (prod SA), only ever contain channels CI deployed
for a real PR in this repo, are denied to all clients, and are removed on PR
close. A stale entry (if cleanup ever lagged) points at an expired/dead channel
that 404s — no data exposure.

## Transition / sequencing

Deploying the dynamic function to prod removes the `readout-panel` hard-code, so
the manual `readout-panel` channel stops loading secured layers. To keep part-1
review going, either (recommended) open a PR for the redesign branch — its
auto preview channel becomes dynamically allowlisted and is the new review
surface — or temporarily keep a static `readout-panel` entry until then.

## Testing (manual + a rules check)

- Open a throwaway PR → CI deploys the preview channel and writes the Firestore
  entry → open the preview URL → secured geology renders.
- Close the PR → CI deletes the entry → re-open the (now dead/!allowlisted) URL →
  no secured layers.
- Verify `firestore.rules` deny client access (emulator/rules test or console).
- Static origins (prod/dev site, localhost) still load secured layers; a
  random non-allowlisted origin does not.
- `node --check` on any changed JS; CI YAML validated by a dry run / lint.

## Out of scope

- The same-origin proxy (the long-term, origin-independent fix — belongs with the
  MapLibre/TanStack rewrite).
- The readout redesign (parts 1 & 2).
- Caching the Firestore read.

## Risks / notes

- Mixed credentials in the PR workflow (dev SA to deploy, prod SA to write prod
  Firestore) — keep them in separate steps with separate secrets.
- Enabling Firestore + the prod function deploy + the new CI are prod/infra
  changes; the user runs/approves those deploys (and enables Firestore once).
- The prod function's runtime SA needs Firestore read (Firebase default SA has
  it); CI's prod SA needs Firestore write (the deploy SA typically does).
