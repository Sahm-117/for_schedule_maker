# Session: Pre-cohort trainings, meeting-link fix, Cover removal, user guide + App Guide deck

**Date:** 2026-09-24
**Branch:** main
**Session ID:** 69a36da5 (the auto row saying "session cleared, no work" is wrong; this file replaces it)
**Commits pushed:** `f67d56a` (trainings + link fix), `507e30f` (Cover removal + user guide)

## What Was Done
- **Meeting links without https (bug):** new `frontend/src/utils/links.ts` `normalizeLink()`; applied on save + Join href in `MeetingCallCard` (`components/groups/GroupCallCard.tsx`, covers groups and hub) and on the admin group save in `AdminGroupsPage.tsx`.
- **Phase 4 trainings & get-togethers** (plan `~/.claude-sam/plans/4-pre-cohort-trainings-cuddly-donut.md`):
  - Admin Hubs → "Trainings & get-togethers" tab: create/edit/delete, mark attendance. A cohort dropdown defaults to the soonest upcoming cohort, because trainings always happen before their cohort starts. The list shows active + upcoming cohorts with a cohort pill.
  - Lead-only Trainings tab in My Hub.
  - Settings rule `minTrainingsAttended` (default 1).
  - Groups (GroupFormModal + AssignSupportModal): Save is blocked below the minimum ("Missed all pre-cohort trainings"). Override with a reason saves an `ELIGIBILITY_OVERRIDE` SupportNote. Pickers show "x/y trainings". The Supports page shows "Trainings x/y".
  - Counting: only PRE_COHORT_TRAINING sessions; attended = any mark except ABSENT; no block if the cohort has 0 trainings (`utils/programmeRules.ts` `buildTrainingCounts`).
  - Migration `20260925040000_pre_cohort_trainings.sql` (admin write policy on SupportSession, excludes SUNDAY_RECAP) was applied live.
  - Playwright passed all 5 steps; test rows were cleaned up.
- **Cover feature retired (Olamide: "there is no cover request again"):**
  - Removed from the README, the daily-checks cover push (redeployed), `coverRequestsApi`, the CoverRequest types and the COVER_REQUEST notification type.
  - Deleted the unused `CoverRequestsPanel.tsx` and `attendance/SundayClassPanel.tsx`, with Olamide's approval.
  - The DB `CoverRequest` table is untouched.
- **user-guide.html** rewritten to current app (Hubs, My Hub, trainings, Community, participant app, late rule, one-person announcements). Rota page + Dashboard health not covered.
- **App Guide deck rebuilt:**
  - Output: `~/Documents/Community/FOF - TCN/FOF Ops App Guide 2026-09-24.pptx` + `.pdf` (35 slides, same house style).
  - Source: `deck-sources/build-app-guide.py`, with screenshots in `deck-sources/img/app-guide/`.
- Stopped the long-running 5173 dev server (low RAM).

## Key Decisions & Patterns
- Opus orchestrates and reviews; Sonnet agents build, verify, write docs and decks.
- Auto mode blocks production DDL and function deploys. Give Olamide a `!` command instead:
  - Migrations: `PG_PATH=<scratchpad>/node_modules/pg node scripts/apply-migration.cjs <file>`. pg isn't a project dependency, and the URL env var is `SUPABASE_URL` in the root `.env.local`.
  - Deploys: `SUPABASE_ACCESS_TOKEN=... npx -y supabase functions deploy <fn> --project-ref vnmeeqvwqaeczjlvzoul`.
- `scripts/apply-migration.cjs` is untracked (not committed).
- Worktree-isolated agents lack env files and node_modules; the main tree was used instead after the first one.

## Pending Tasks
- Code health: ~92 rules-of-hooks lint errors; 96 Dependabot alerts (45 high). Awaiting Olamide's go-ahead.
- Deck caveats:
  - Admin screenshots show real Cohort 9 participant names (phones masked).
  - My Hub slides have no screenshot, because the test support isn't in a hub.
- `.env.test.local` admin test password is stale; Olamide to update it.
- Mobilisation Guide deck still dated 18 Sep (not requested this session).
- Unverified from before: hub meeting reminder push, follow-up issue alert, participant countdown on a live Sunday; participant-app live notification bell.
- Training marks can't be cleared, only set to Absent (same as recap).
- daily-checks inline section comments are numbered 2/4 while the header says 1/2/3 (cosmetic).

## Errors Hit & Fixes
- A Sonnet agent hit the session usage limit mid-task and was resumed via SendMessage after the reset.
- apply-migration script first failed on a missing pg module, then on the wrong env var name. Both were fixed.
