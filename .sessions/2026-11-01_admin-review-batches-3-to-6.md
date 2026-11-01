# Session: Admin review batches 3–6, Participants/Faith projects upgrades, no-group auto-move

**Date:** 2026-11-01
**Branch:** main
**Session ID:** d78c90d0-a182-4485-bcbe-d894e01fe297

## What Was Done
- Pulled 186 remote commits. Checked Olamide's owner decisions against live data:
  - Practice is off.
  - The onboarding limit stays at 5 days.
  - The mid-cohort survey is on (week 5).
  - The rota is unused, and its reminders reach nobody.
  - "Admin User" (admin@fof.com) and "System Admin" are to be left alone.
- Built the 31 Oct admin pick-up list in six batches. Cheaper agents built each batch in its own worktree. Each batch was then reviewed, browser-tested as admin with every write blocked, code-reviewed with fixes applied, and pushed. Handoffs: `docs/handoffs/2026-11-01_admin-review-batch-3.md`, `-batch-4.md`, `-batch-6.md` (batch 6's handoff also covers batch 5).
- Fixed the cross-week add, edit and delete so they stay in the activity's own cohort. They used to match week numbers in every cohort. Live data showed no stray copies.
- Later the same day:
  - **Participants:**
    - "Not in a group" is an accordion.
    - The Source column is removed.
    - New attendance dots column, with a key beside the count. A week counts once it has any register marks, because Cohort 10's week 1 has a blank classDate, which means "use the cohort start date".
    - Five quick chips. Three of them drive the same Filters values.
    - A side panel opens on tapping a name; Cmd-click still opens the full profile.
  - **Faith projects:** grouped by hub, then group (a group's hub is its support's hub), closed to start, with a Remind button per hub.
  - **PWA:** an update found within 20 s of opening or returning to the app applies at once, unless someone is typing (`PWAUpdateBanner.tsx`).
  - **Missed-class review and auto-move include people in no group** (`20261101140000_absence_include_no_group.sql`, applied live by Olamide; FLOW_MAP rule 119 updated). The list went from 22 to 26.
- After batch 6, the Scriptures admin engagement totals got a "More in PostHog ↗" link to https://us.posthog.com/project/695154/dashboard/2275022 (`POSTHOG_DASHBOARD_URL` in `lib/analytics.ts`). The Resources page has no totals, so nothing was linked there.
- Batch 6 put four live migrations in place (reopen reason, private survey uploads, website change history, Supports overview RPC) and deployed `file-links` v2. Olamide ran the go-live script himself, because the safety check blocks Claude from production deploys.

## Files Changed
- `frontend/src`: about 50 files across admin pages, `components/charts/`, `components/schedule/StandardWeekCopy.tsx`, `ConfirmReachModal.tsx`, `AttendanceSupportPicker.tsx`, `AnnouncementResend.tsx`, `BirthdayGraphicsBatchSheet.tsx`, `planner/SignUpTargetCard.tsx`, `WebsitePreviewPage.tsx` and `services/supabase-api.ts`.
- `supabase/migrations/20261101100000` to `20261101130000`.
- `supabase/functions/file-links/index.ts`.

## Key Decisions & Patterns
- The test admin login is gone. Browser checks use a temporary 3-hour `AppSession` for System Admin, created and deleted by a scratchpad script, with every REST write, write-RPC and function call intercepted.
- The attendance trend loads only in the "All weeks" view, to avoid about 20 reads every time the page opens during Sunday load.
- The rota "same person every week" fill skips weeks whose activities carry other labels.
- Migrations are dry-run in a rolled-back transaction, with the new RPCs called as admin, before they are applied.

## Pending Tasks
- Watch the 4 pm automatic move on 1 Nov (class 3 register must be finalised). The 4 people with no group never got the Saturday warning.
- The red banner counts 26 (group and no-group); before 10 am on a Sunday, the app's "judged" weeks exclude the latest class (`currentWeekNumber` anchors on last Sunday 10 am).
- The admin review list is finished. Olamide dropped the birthday-graphic-to-chat item and the rota Dashboard warning.
- Participant-side checks, which had no participant login: the feedback prompt after class 3, and a participant uploading a survey file.
- The church app keys page fires one read per key. There are 0 keys today, so this is deferred.
- `checkDuplicates` still matches across cohorts. It is read-only and only drives a warning.

## Errors Hit & Fixes
- The code reviews caught the survey FILE answer being read as text (every file was refused) and an enum/'' COALESCE that would have failed the Supports RPC every time. Both were fixed before going live.
- The ContextSaver hook failed because the API credit was too low, so this note was written by hand.
