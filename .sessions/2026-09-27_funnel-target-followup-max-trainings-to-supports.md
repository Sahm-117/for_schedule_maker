# Session: Funnel vs target, follow-up max ring, trainings moved to Supports + "What I learned"

**Date:** 2026-09-27
**Branch:** main
**Session ID:** e92aeb71-0d32-4ce7-8ab5-acfe9a0d9e6e

## What Was Done
- Agreed a 4-session plan with Olamide (saved in memory `four-session-plan-2026-09-27`). Sessions 1 and 2 are done and pushed; 3 and 4 are next.
- **Session 1 (pushed `f759752`)**
  - Dashboard: the Registered box shows "% of <target> target", using the cohort's sign-up target (`settingsApi.getMobilisationTarget`), or "No target set". The Contacts box shows "N open · first sign-up X minutes/hours/days ago". The time is the earliest FollowUpContact.createdAt, fetched inside `cohortsApi.getHealth`.
  - New programme rule `maxFollowUpsPerSupport` (default 15) in Settings → Supports.
  - `LoadRing` component: shows N/max, green, then amber from 80%, then red when full. It appears in AppSelect options (`ring` field) and on the closed trigger, in the Follow-ups contact table pickers (column, owner sheet, bulk bar), in the contact modal, and on Supports page cards.
  - Assigning past the max shows a ConfirmationModal ("This support is full… Assign anyway"). The contact modal shows an inline amber note instead.
- **Session 2 (pushed `f96588f`)**
  - Trainings & get-togethers moved from the Hubs page into a tab on the Supports page (`?tab=trainings`, `components/supports/SupportTrainingsPanel.tsx`), including create/edit/delete, marking, and a "Who can mark" button (TrainingMarkersModal). The Hubs page and AttendanceSummaryStrip are recap-only now; the strip's training props are optional.
  - Session cards show "x of y marked", "N present" and "N absent", plus a **See results →** button. The results modal has status cards (Everyone/Present/Late/Absent/Excused/Not marked) that act as filters, and each support's answers are listed.
  - `TrainingPill` on Supports cards: red at 0/n, amber when some are attended, green at n/n. Tapping it lists each training as attended, missed or not marked, with the support's answers.
  - `TrainingLearnedCard` (support home) is a popup that can't be closed. It shows from 12:00 local time on the training day to supports marked PRESENT or LATE. It has two questions ("What did you learn?" and "What will you apply going forward?"), each needing at least 4 words and 15 characters. It only covers cohorts that are not COMPLETED or ARCHIVED.
  - Migration `20260927220000_training_learned.sql` (APPLIED LIVE): adds `SupportSessionAttendance.learned`, `"willApply"`, `"learnedAt"`, plus the RPC `submit_training_learned(p_session_id, p_learned, p_will_apply)`.

## Files Changed
- frontend/src/components/LoadRing.tsx (new), components/AppSelect.tsx, components/followups/{FollowUpContactsTable,FollowUpContactModal}.tsx
- frontend/src/pages/{AdminDashboardPage,AdminFollowUpsPage,AdminSettingsPage,AdminSupportsPage,AdminHubsPage,SupportHomePage,SupportMyHubPage}.tsx
- frontend/src/components/supports/{SupportTrainingsPanel,TrainingPill,TrainingLearnedCard,LearnedAnswers}.tsx (new)
- frontend/src/components/hubs/AttendanceSummaryStrip.tsx, components/TrainingAttendancePanel.tsx, components/dashboard/healthModel.ts
- frontend/src/services/{api,supabase-api}.ts, utils/{followUps,programmeRules}.ts
- supabase/migrations/20260927220000_training_learned.sql

## Key Decisions & Patterns
- The load ring counts OPEN follow-ups only (`openLoadByOwner` uses `isClosedContact`). When a support is full, assigning warns but still allows it (Olamide's choice).
- A training counts as attended when its status is not ABSENT (existing `trainingMarkAttended`, so EXCUSED counts). The pill only uses pre-cohort trainings for the active cohort.
- `SupportSession.sessionDate` is stored as local midnight (e.g. `2026-09-26T23:00Z` = 27 Sep in Lagos). Use `new Date(iso)` plus local setHours, never `slice(0,10)`.
- `grep` on `services/supabase-api.ts` silently returns nothing (it gets treated as binary); use `/usr/bin/grep`. zsh also breaks `--include=*.tsx` unless it's quoted.
- `tsc -p tsconfig.app.json` already had errors before this session (AppShell, HubMeetingPanel, AdminWebsitePage, CoverRequest, setAdjustingCount), so only check files you touched. `vite build` passes.
- Olamide told me to push fof_schedule without showing the push-details block (memory `push-without-details`).
- The SQL pooler host for this project is `aws-1-eu-west-2` (memory `supabase-pooler-host`). `pg` and `playwright` are installed in the scratchpad, not the repo.
- Playwright: test creds are TEST_ADMIN_* and TEST_SUPPORT_* in .env.local, and the dev server is on :5178. Mock or abort writes; tests use a fake programme_rules (max=1) and a fake pending training.

## Pending Tasks
- **Session 3:** tapping ★ on the Hubs page opens a popover with the note history, where you can read, edit and add notes (SupportNote has no edit API yet).
- **Session 4:** participant home before the cohort starts (first class + countdown, Your group, Group call "support will share link", Faith Project "Start your SMART goal", Join call disabled until there's a link). Add a "Get ready" checklist that ticks itself, which becomes "This week" once the cohort starts. Replace the Faith Project guide with ~/Downloads/"Foundation of Faith - Faith Project Guide Reader.html" (full-screen, like the welcome guide). Convert Class 2 and 3 from the ~/Downloads Reader HTMLs into the class manual reader (the `manuals/class1.ts` pattern).
- Open question for Olamide: should the training pill always show before the "+N" tag fold on Supports cards? Right now it's often hidden behind "+1".
- Still from earlier: commit the migration `20260927190000_funnel_excludes_form_self_signups.sql` (untracked; already applied live), delete the ZZ Demo Participant when Olamide says he's done with it, and the guide top-bar wording ("Welcome to FOF" vs "FOF Ops").

## Errors Hit & Fixes
- The CLAUDE.md pooler host `aws-0-eu-west-1` gave "tenant/user not found"; `aws-1-eu-west-2` works.
- Playwright login sometimes fails on the first try, so the test script retries once.
- The first version of the popup showed "App Usage" from the finished ZZ Demo Cohort. Fixed by filtering on cohort status.
