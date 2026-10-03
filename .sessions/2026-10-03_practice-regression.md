# Practice regression fixes — 2026-10-03

## What Was Done

User requested a Practice-first app regression pass and authorized pushing fixes in tested batches. Work uses the attached managed worktree on `codex/practice-regression-fixes`, starting from main `28e449a`; original checkout changes were preserved. Publishing actor is Sahm-117, author Sam <tisnotaname@gmail.com>, destination main.

Batch 1 fixes Practice participant class links (`/me/week/1`), account return (`/support/schedule`), a legacy schedule alias, cold-entry readiness/retry and disabled-entry redirect, failed checklist save reconciliation/confirmed-state rollback with a visible error, and the Practice participant Active stage label. Independent review caught and resolved the rapid double-failure rollback case.

Batch 1 is pushed as `63dbe6f`; both Vercel statuses succeeded and production entry/lazy chunks were verified. Batch 2 contains the two database migrations described below, both applied and recorded in deployed migration history before publication.

## Files Changed

Frontend: App.tsx, AppShell.tsx, PracticeDock.tsx, practiceScenarios.ts, PracticeEntryContext.tsx, ParticipantHomePage.tsx, SupportPracticeEntryPage.tsx, practiceSwap.ts. Database batch candidates: `20261003200000_practice_regression_progress.sql` and `20261003210000_support_delete_handover_order.sql`.

## Verification

Production build and diff whitespace check passed. PracticeDock targeted lint passed; unrelated existing AppShell/context lint and project TypeScript errors remain. Browser tests use local frontend port 5176 and deployed Supabase with synthetic test users only. Route smoke covered 24 admin, 12 support and 9 participant routes without runtime/console errors. Practice checks covered all staff seats, manual done/stuck/untick, participant onboarding/password, reload, canonical class/account routes and legacy alias, slow cohort entry, disabled entry, failed save/read and rapid failed edits, peer request/accept/shared progress/end/decline/cancel. Expected simulated network failures are separate from successful-flow console checks.

## Backend / Handoff Notes

Progress/reset migration passed a rollback-only deployed trial: per-event cutoffs before minima; legacy admin reset advances resetAt; affected active walkthroughs end before replacing participants and both supports' participant-view flags clear. Post numbering preserves the original introduction/second-post semantics. Authorization, idempotency, reset isolation, session invalidation and replacement-participant entry passed.

All four deployed function bodies exactly match the migration. An expanded 40-assertion matrix passed before application and again against deployed definitions without replacing them, covering each activity family, reset/walkthrough event minima, no peer reply tick outside an active walkthrough, stable post ranking and autoDisabled preservation. Independent read-only review approved both migrations. Seat-switch shared post progress and participant first-sign-in reset retain their existing activity history semantics.

Support deletion failed on the old deployed handover FK. Proposed BEFORE DELETE User trigger unassigns support groups while the user still exists; groups/participants and attributed handover names are preserved. User explicitly approved adding/applying this trigger after auto-review blocked the delegated write. Parent wrote it after that approval. Rollback trial passed deletion and restrictive-FK failure rollback, and verified the trigger function is private.

The trigger is now enabled live and its direct execution remains private. Playwright Admin Users permanently deleted only the synthetic QA Beta support, and verified that the Practice group, three participants and handover names remain, with zero browser console/runtime errors. Exact QA group IDs are recorded for cleanup even after supportId becomes null. Neither migration should be blindly reapplied.

## Pending Tasks

- Publish verified database batch; record commit/deployment result here.
- QA fixtures remain until final verification: two synthetic supports, admin, control cohort/contact/participant, dedicated Practice hubs, generated Practice groups/participants, QA sessions/notifications/peers. Cleanup script is under `/private/tmp/fof-practice-regression`; check fixture ownership and zero residue before ending.
- Temporary harnesses, screenshots and credential-bearing fixture JSON remain outside the repository; never commit them.

## Errors Hit & Fixes

Browser harness overlay timing and initial fixed waits caused false negatives; use actual modal/route readiness. A rapid alias navigation during account restoration initially bounced to login; settled restoration and peer account-return checks passed. No speculative auth change was made. Build warnings and baseline TypeScript/lint errors were not expanded into unrelated cleanup.
