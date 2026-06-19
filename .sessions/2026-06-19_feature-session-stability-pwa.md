# Session: Dashbaord breakdown merge & onboarding module stability

**Date:** 2026-06-14 to 2026-06-19

## What was done

### Dashboard
- Merged "Contacts" + "What happened" tables into single "Breakdown" table with `Owner | Assigned | Still Open | Registered | Wrong Number | Not Interested | Not a Good Time | Not a TCN Member | No Response`

### Participants / Groups / Attendance / Faith modules (new)
- 5 new Supabase migrations + 6 new pages (admin + support) for Participants, Groups, Attendance, Faith Projects, Group Prayers
- Full CRUD + onboarding status tracking with `OnboardingEvent` trail

### Bug fixes

**Button-in-button hydration error** (`AppShell.tsx`) — changed outer `<button>` (navigate home) to `<div role="button">` with `onKeyDown`; added `stopPropagation` on inner Refresh button.

**Infinite loading on My Group & Onboarding pages** — root cause was a self-perpetuating loop in `AppDataContext`: `initialize()` called `loadCohorts()` → `applyActiveCohort()` → new `activeCohort` object → `loadWeeksForCohort` deps changed → `initialize` effect deps changed → loop. Fixed by removing `activeCohort` from `loadWeeksForCohort` deps (unused; `cohortForDate` param covers it). Also removed `liveRevision` from effect deps in `SupportParticipantsPage`, `SupportOnboardingPage`, and `AdminOnboardingPage`. Added `refreshInProgressRef` guard in `refreshWorkspaceData`.

**Missing `GroupPrayerStatus` table** — created migration `20260619000005_group_prayer_status.sql` and deployed the `notify-onboarding-event` edge function to fix CORS error.

**Text simplification** — replaced all complex language with plain words ("Steps", "Talked to", "Knows venue", "Group set up", "People done", "Tap a person", "Get [name] started").

**Donut progress charts** — replaced binary checkmark `StatusLine` with `ProgressLine` component showing `X/Y` count + SVG ring chart (green 100%, amber in progress, gray 0%).

## Commits
- `6ae80fb` — Merge Still Open into single Breakdown table
- `d9961a7` — onboarding page stability, donut charts, plain language, missing migration, CORS fix

## Files changed
- `frontend/src/AppShell.tsx` — button-in-button fix
- `frontend/src/context/AppDataContext.tsx` — context refresh loop fix
- `frontend/src/pages/SupportParticipantsPage.tsx` — loading fix, no `liveRevision`
- `frontend/src/pages/SupportOnboardingPage.tsx` — donut charts, plain text, no `liveRevision`
- `frontend/src/pages/AdminOnboardingPage.tsx` — no `liveRevision`, stable deps
- `frontend/src/components/followups/FollowUpDashboard.tsx` — merged tables
- `supabase/migrations/20260619000005_group_prayer_status.sql` — missing table
- `supabase/functions/notify-onboarding-event/index.ts` — deployed
