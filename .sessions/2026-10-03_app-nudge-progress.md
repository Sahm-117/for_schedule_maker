# App nudge progress — 2026-10-03

## What Was Done

Finished the three additions proposed in the Claude cloud conversation: refresh the support Home app-nudge card on return/online and every two minutes while visible; show a dated Sent tag and sort messaged people last; write a one-time support bell notification when a participant has installed the app and saved a push subscription. The support guide explains this flow.

Implementation is on `codex/finish-app-nudge`, based on cloud main `438afba`, in managed worktree `/Users/olamide/.codex/worktrees/finish-app-nudge/fof_schedule`. User reviewed the result and explicitly approved committing/pushing to main. Original checkout `/Users/olamide/fof_schedule` retains its pre-existing modified `.sessions/INDEX.md` and untracked `frontend/dev-dist/`; those were not changed.

## Files Changed

- `frontend/src/components/supports/AppNudgeCard.tsx`: refresh, persisted dates, unsent-first sorting, save failure/retry message, stale-response and owner guards.
- `frontend/src/services/supabase-api.ts`: `appNudgeApi.markSent` RPC.
- `frontend/src/types/index.ts`: optional `AppNudgePerson.sentAt`.
- `frontend/public/guides/app-guide/content.js`: support guide update.
- `supabase/migrations/20261003150000_app_nudge_progress.sql`: private send/completion tables, RPC, completion triggers.
- This summary and `.sessions/INDEX.md`.

## Key Decisions & Patterns

- Sent means the support opened the prepared WhatsApp message, not confirmed delivery. No messages were sent during testing.
- Sending the video does not mark setup complete; existing `app_nudge_people()` remains the card/daily-push source of truth and keeps its upcoming-cohort cutoff.
- Completion notification is a bell row only, atomic with a per-participant completion ledger. Advisory locking handles concurrent installation/subscription writes in either order. Repeat opens/devices do not create duplicate alerts.
- Already-completed installs were silently seeded to avoid historical alerts. Test participants/supports and practice cohorts are excluded.
- Completion ownership uses follow-up owner, then the latest active group support. Completion can notify after cohort start even though the reminder card only covers upcoming cohorts.
- No edge function, cron, package, or deployment configuration changes.

## Backend / Handoff Notes

Migration **has already been applied and verified** on deployed Supabase project `vnmeeqvwqaeczjlvzoul`. Do not blindly re-run its CREATE TABLE/FUNCTION statements. Frontend has NOT been published; production still deploys from main via Vercel.

Verification passed: frontend build; targeted AppNudgeCard lint; `git diff --check`; 25 rollback-only deployed DB checks for ownership, exclusions, ordering, invalid tokens, both setup orders, one-time notifications and private grants; actual support-role Playwright against local frontend/deployed backend for failed save/retry, Sent persistence/sort, focus refresh, real two-minute refresh, bell activity, last-person card hiding and concurrent deduplication. Successful UI flow had zero console/runtime errors. Independent explorer review found no blocking issues after the owner guard fix.

QA fixtures were removed and zero cohort/user/participant/contact counts verified. Existing practice mode automatically generated a practice group and three test participants for the QA login; provenance was checked and those exact generated fixtures were removed too. No real recipients were notified.

Temporary test harnesses/screenshots/logs are under `/private/tmp/fof-app-nudge-tools` and `/private/tmp/fof-app-nudge-*`, not repository files. Do not commit temporary credential-bearing fixture files. Worktree frontend dependencies/environment are ignored symlinks to the original checkout. Local Vite preview was started on port 5175.

## Pending Tasks

- Publishing approved by user on 2026-10-03; this changeset is ready for main. Verify the resulting Vercel production deployment.
- Verified GitHub credential actor: `Sahm-117`; use established commit author `Sam <tisnotaname@gmail.com>`; proposed destination is `Sahm-117/for_schedule_maker` branch `main`.
- Remote refreshed immediately before committing; origin/main remains `438afba`. Publish this scoped feature only, preserve original checkout changes, and verify production after Vercel deploy.
- Update this summary with the actual pushed commit and deployment result after publishing.

## Errors Hit & Fixes

- Initial cloud/local history differed; fetched and implemented in an isolated managed worktree from current origin/main.
- Existing practice-cohort uniqueness blocked one trial fixture; used existing practice cohort inside the rollback-only transaction.
- Bundled Chromium version was unavailable; Playwright used installed Chrome. Removed mocked clock because it caused unrelated analytics latency errors; verified the real timer instead.
- Existing practice handover trigger required deleting QA-generated practice memberships before group/account cleanup. Auto-review initially rejected cleanup pending provenance; verified timestamps, exclusive membership and unused test accounts plus automatic practice creation, then cleanup was approved and completed.
