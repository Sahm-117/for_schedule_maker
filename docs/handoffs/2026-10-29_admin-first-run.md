# Admin first run follows flow-onboarding

Date: 2026-10-29. Frontend only: no migration, no function. FLOW_MAP rule 116 (rule 115 updated to point at it).
The repo now carries the `flow-onboarding`, `flow-auth` and `flow-permissions` skills in `.claude/skills/` (MIT,
licence beside each), pushed in e9c4b55.

## Why
A flow-onboarding review of the admin side found it against the guide in several ways:
- The setup checklist had 10 rows, and the labels were not verb-first.
- The checklist had no progress bar and no finished state.
- First sign-in showed a Welcome modal plus a 6-step tour together.
- The notifications banner asked on the first visit, before there was anything to notify about.

## What changed
- **Checklist:** five verb-first steps:
  1. Set up the cohort and its weeks
  2. Publish the schedule
  3. Get people into groups (target, participants, groups, supports, everyone placed)
  4. Set up hubs
  5. Prepare prayers and daily scriptures
- A step made of several checks shows "Next: …" for the first open one, and Open goes to that page.
- There is a progress bar. Once every check has been read and all five steps are done, the checklist becomes one line: "<cohort> is ready to start".
- **Full admins** (ADMIN, not team members):
  - No Welcome or auto-tour. Instead the checklist shows one "Start here" hint until "Got it", saved per account as `hint:admin-setup`.
  - The notifications banner and the Get the app sheet wait until the cohort they are on has started, or an approval is pending.
- **Unchanged:** schedule preparers, team members and supports keep the Welcome and the immediate notifications ask. The "?" tours are unchanged.

## Tested
- `npm run build`. `tsc` shows only the 7 errors already on `main`, and eslint has no new problems.
- Mocked-backend Playwright at 1280 wide, 13 checks, no console errors. Scenarios:
  - Empty cohort.
  - Fully set-up cohort.
  - First sign-in: hint shows, "Got it" is saved, and the "?" tour still runs.
  - Started cohort: the banner comes back.
- /code-review (high), all 10 findings fixed:
  - "Ready" waits for every check to be read.
  - The Welcome skip and the notifications delay apply to full admins only.
  - "Started" means the admin's current cohort, not any old cohort.
  - The hint stays hidden when saved progress cannot load.
  - Small tidy-ups.
- Not tried with a real admin login.

## Open items
- For an admin on a running cohort, the notifications banner appears once cohorts finish loading. That can shift the page down slightly on first paint.
- The support side still shows the Welcome, a 5-step tour and the notifications banner together on the first visit. The same flow-onboarding fixes could apply there.

## Gotchas
- Stopping the dev server with `pkill -f "vite --port 5199"` also matches the shell running it. Kill by pid instead.
