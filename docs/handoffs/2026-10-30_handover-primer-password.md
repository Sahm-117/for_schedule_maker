# Handover primer behind a shared password

Date: 2026-10-30. Follows [Church app access in the menu; handover primer site](2026-10-30_church-app-access-menu-and-primer.md).

## What changed
- `sites/project-primer/functions/_middleware.js`: Cloudflare Pages asks for a username and one shared password
  (HTTP Basic auth) before serving any file of the primer. Chosen over Cloudflare Access because the team uses
  personal Gmail addresses and did not want email codes.
  - Password from the Pages secret `PRIMER_PASSWORD`; username from `PRIMER_USER`, default `fof`. Nothing in the repo.
  - No password set: the site answers 503 "This page is not open yet." (closed, not open).
  - Comparison is on SHA-256 hashes with `crypto.subtle.timingSafeEqual`.
  - Answers carry `Cache-Control: private, no-store`.
  - `/functions/...` answers 404, because the site folder is also the output folder.
- `sites/README.md` says how to set the password.
- The Pages project is `fof-ops-handover` (`fof-ops-handover.pages.dev`), made by the owner.

## Live changes
- None to the app, database or edge functions.

## Tested
- Locally with `wrangler pages dev` (the Pages runtime) on a copy of the folder:
  - no credentials: 401 with the sign-in prompt;
  - wrong password: 401;
  - wrong username: 401;
  - malformed header: 401;
  - right credentials: 200, page and image;
  - image without credentials: 401;
  - `/functions/_middleware.js`: 404;
  - no password set: 503.
- Not yet tried on the deployed project; it needs the secret set first.

## Open items
- Owner: set `PRIMER_PASSWORD` in the Pages project, redeploy, check it asks for the password, then delete the Cloudflare
  Access application made for this site so people are not asked twice.

## Gotchas
- Basic auth sends the password with each request; fine over HTTPS (pages.dev is HTTPS only). Browsers remember it
  until they are closed. Anyone given the password can pass it on; change it when someone leaves.
