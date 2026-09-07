# Working on The Third Position

## Mandatory: bump the service worker cache on every deploy

`service-worker.js` caches every asset for offline use. **Any time a file in
`ASSETS`' list changes — or a file gets added to it — bump `CACHE_NAME`**
(e.g. `third-position-v10` → `third-position-v11`) before committing.

Without this, the service worker keeps serving the old cached versions of
changed files to anyone who already has the app open or installed — the
fix genuinely doesn't reach them. This has been the standing rule for every
change this project has shipped; it does not get skipped for small edits.

## Before pushing

- `node --check` every changed `.js` file.
- Run the app locally (`python3 -m http.server` + headless Chromium/
  Playwright) and confirm no console errors on the views touched.
- Confirm the GitHub Pages deploy actually picked up the change (poll
  `service-worker.js` on the live URL for the new `CACHE_NAME`) before
  telling the user it's live.
