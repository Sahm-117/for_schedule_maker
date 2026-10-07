# Session: Hubs/attendance plan, sign-up fix, cohort member search, Community rename

**Date:** 2026-09-22 → 2026-09-23
**Branch:** main
**Session ID:** f347fbe5-2a13-404d-83a2-ed17806d37f8

> The index previously pointed this session id at `2026-09-22_session-cleared-no-work.md`
> (auto-written at /clear, before any work). This file is the real record.

## What Was Done
- Digested the 2026-09-22 attendance-design call and wrote the approved plan:
  `~/.claude-sam/plans/4-pre-cohort-trainings-cuddly-donut.md` (Phases 0–4).
- **Phase 0 (pushed `7349dfd`)**: app-added contacts can no longer re-enter "Signed up on the form".
  Apps Script skips rows whose "How they heard" equals the Settings marker (`Registered in the FOF app`);
  `receive-form-registration` rejects them too (deployed). Manual adds now read
  "Added for follow up by {name}". The flagged rows were only in the Google Sheet (written by the old
  app→sheet push on 16–17 Sept) — the app's form list was clean. Olamide re-pasted the script (with real
  SECRET/APP_ANON_KEY filled from `.env.cron.local` / `frontend/.env.local`, via a scratch copy — repo copy keeps placeholders).
- **Cohort Support members modal (pushed `3f2d712`)**: search + "Turn all on/off" (acts on visible rows).
  Audit: all other support/participant lists already had search.
- **Data fix**: Adejoke Adebisi's follow-up set NOT_REGISTERED → REGISTERED (only linked contact out of 13 that was wrong). Olamide ran the script.
- **Phase 1 (pushed `92e56ca`)**: forum "Hub" → "Community" (routes `/community`, `/support/community`;
  `/hub` + `/support/hub` redirect because stored notifications carry old paths; "Resource Hub" → "Resources").
  DB tables, `hubApi`, `notify-hub` name, type `'HUB'` unchanged. `notify-hub` deployed.
- **Loop fix (pushed `0e4ab25`)**: Community page flooded `User` with PATCHes forever since `ed1f436` (21 Sept) —
  `markHubSeen` depended on `user`, which it replaces. Now keyed on `user.id`. Verified: 2 writes (StrictMode) then stops.

## Key Decisions (plan)
- Late / Left early = missed for certificate; admin can excuse after appeal with an admin-only note; participant sees "Late · counted as attended".
- After 15-min window: unmarked → Absent; supports may only change Absent → Late/Left early.
- Hubs per cohort, lead = existing support; every support sees My Hub; lead marks recap (incl. self), notes (admin+lead only), messages hub.
- Missed recap counts in support health colour. 0 pre-cohort trainings = hard block on group assignment, admin override with note.
- Workflow: Opus orchestrates, Sonnet 5 agents execute + Playwright-verify (Pro plan, limited usage).

## Pending Tasks
1. **Phase 2** — Sunday countdown window, late rule + admin excuse, absence push, participant Attendance tab. Before shipping: count existing LATE records and show completion-% impact.
2. Phase 3 (Hubs), Phase 4 (trainings + assignment block).
3. Olamide deleting stale Cohort 10 rows in the sheet and adding a green divider himself — warned that inserting rows shifts row keys (duplicates if "Import past sign-ups" is run later).
4. Existing security gap (not touched): `send-announcement` and `notify-users` have no caller check.

## Errors Hit & Fixes
- Auto-mode classifier blocks prod data writes and deploys → prepare scripts in scratchpad, Olamide runs with `!` (no leading space).
- `pg` is in the scratchpad `node_modules`, not `frontend/node_modules`. Pooler host `aws-1-eu-west-2`.
- Push via `GIT_ASKPASS` helper (scratchpad `askpass.sh`) reading `.env.github.local`.
- Admin screens in Playwright: log in as test support, rewrite role in `sign_in`/`get_session_user` responses, then client-side navigation only.
