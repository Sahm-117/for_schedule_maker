# FOF Ops Feature Polish Session

Date: 2026-06-19
Branch: `codex/fof-ops-feature-polish`
Commit: `d3b9904 Polish FOF ops support workflows`
Remote: `origin/codex/fof-ops-feature-polish`
Build: `npm run build` from `frontend/` passed before push

## What Was Done

- Finished the FOF IKD Ops handoff work around activity tags, cohort week management, and support-defined weekly prayer focus.
- Moved schedule routing labels into the Schedule area as "Activity tags" and removed label management from Settings.
- Reworked cohort week management with real week chips, add/delete/duplicate flows, a delete guard requiring at least one week, and per-week class titles.
- Added support-defined group prayer focus so support can choose a participant for a group/week and still mark the prayer status done through the existing completion API.
- Updated support attendance to use dropdowns for week and attendance status, added tappable participant rows with chevrons, and added a notes modal that saves to `Participant.notes`.
- Refined the support home dashboard with a compact orange/white treatment, a stable 2x2 quick-stats grid, better empty-state copy, and `Next class` sourced from the cohort week title.
- Removed the dashboard week tracker line after feedback, leaving the compact programme progress summary and stats.
- Added PWA install prompt work:
  - Android uses the real native install action when Chrome exposes `beforeinstallprompt`.
  - iOS uses the platform guidance fallback.
  - Android without a native prompt shows the agreed fallback instruction state rather than pretending to install.
  - The prompt no longer shows the `localhost` host line.
  - PWA icons now use the supplied TCN logo assets.
- Preserved existing dirty work and pushed the finished branch to GitHub.

## Files Changed

- Session / handoff:
  - `.sessions/2026-06-19_feature-session-stability-pwa.md`
  - `.sessions/INDEX.md`
- PWA:
  - `frontend/src/components/PWAInstallBanner.tsx`
  - `frontend/src/hooks/usePWAInstall.ts`
  - `frontend/public/icon-192.png`
  - `frontend/public/icon-512.png`
  - `frontend/public/apple-touch-icon.png`
  - `frontend/vite.config.ts`
- Shared shell and loading:
  - `frontend/src/App.tsx`
  - `frontend/src/components/AppShell.tsx`
  - `frontend/src/components/PageLoader.tsx`
- Tags and schedule:
  - `frontend/src/components/LabelManagement.tsx`
  - `frontend/src/components/ActivityModal.tsx`
  - `frontend/src/components/ScheduleView.tsx`
  - `frontend/src/components/CrossWeekModal.tsx`
  - `frontend/src/pages/AdminSchedulePage.tsx`
  - `frontend/src/pages/AdminSettingsPage.tsx`
  - `frontend/src/utils/pdfExport.ts`
- Cohorts and week titles:
  - `frontend/src/pages/CohortsPage.tsx`
  - `frontend/src/types/index.ts`
  - `frontend/src/services/api.ts`
  - `frontend/src/services/supabase-api.ts`
  - `supabase/migrations/20260619000009_week_titles.sql`
  - `supabase-schema.sql`
- Group prayers:
  - `frontend/src/pages/AdminGroupPrayersPage.tsx`
  - `frontend/src/pages/SupportParticipantsPage.tsx`
  - `frontend/src/lib/supabase.ts`
  - `supabase/migrations/20260619000008_group_prayer_focus.sql`
- Support attendance and dashboard:
  - `frontend/src/pages/SupportAttendancePage.tsx`
  - `frontend/src/pages/SupportHomePage.tsx`
  - `frontend/src/pages/SupportSchedulePage.tsx`
  - `frontend/src/pages/SupportProfilePage.tsx`
- Supporting admin/support polish:
  - `frontend/src/pages/AdminAttendancePage.tsx`
  - `frontend/src/pages/AdminDashboardPage.tsx`
  - `frontend/src/pages/AdminAnnouncementsPage.tsx`
  - `frontend/src/pages/AdminApprovalsPage.tsx`
  - `frontend/src/pages/AdminFaithProjectsPage.tsx`
  - `frontend/src/pages/AdminFollowUpsPage.tsx`
  - `frontend/src/pages/AdminGroupsPage.tsx`
  - `frontend/src/pages/AdminOnboardingPage.tsx`
  - `frontend/src/pages/AdminParticipantsPage.tsx`
  - `frontend/src/pages/AdminResourcesPage.tsx`
  - `frontend/src/pages/SupportFollowUpsPage.tsx`
  - `frontend/src/pages/SupportOnboardingPage.tsx`
  - `frontend/src/components/AdminCompletionOverviewDrawer.tsx`
  - `frontend/src/components/UserManagement.tsx`
  - `frontend/src/components/followups/FollowUpDashboard.tsx`
  - `frontend/src/context/AppDataContext.tsx`
  - `frontend/src/hooks/usePushNotifications.ts`
  - `frontend/src/utils/contactImport.ts`
  - `frontend/src/utils/followUps.ts`

## Key Decisions & Patterns

- "Labels" are now user-facing "Activity tags" only where they route schedule visibility; real cohort group pages still use "groups."
- Week class titles live on `Week.title`, not in Settings and not in schedule activity descriptions.
- `Next class` on support home reads from the relevant week title and falls back to `Not set`.
- Attendance notes reuse `Participant.notes`; no attendance-specific note table was added.
- Group prayer focus is separate from the old `GroupPrayer.body`; the old table was left in place for compatibility, but the UI no longer relies on admin-authored body text.
- PWA install UI should only trigger real install where the browser exposes the native prompt. Platform instruction fallback is used only where native install action cannot be invoked.

## Backend / Handoff Notes

- Apply migrations to the deployed Supabase project before testing persistence:
  - `supabase/migrations/20260619000008_group_prayer_focus.sql`
  - `supabase/migrations/20260619000009_week_titles.sql`
- Do not run the full `supabase-schema.sql` against an existing deployed database. Earlier attempts produced expected existing-relation / syntax failures because the full schema is not an incremental migration.
- `GroupPrayerFocus` has open RLS policies in this pass and a unique `(groupId, weekId)` constraint.
- `Week.title` is nullable text and safe for existing rows.
- GitHub CLI auth was invalid during publishing, so the branch was pushed with git but a PR was not opened automatically.

## Pending Tasks

- Open a PR for `codex/fof-ops-feature-polish` if desired:
  - `https://github.com/Sahm-117/for_schedule_maker/pull/new/codex/fof-ops-feature-polish`
- Apply the two Supabase migrations to the target project and verify PostgREST can read/write `GroupPrayerFocus` and `Week.title`.
- Manual mobile verification still recommended:
  - Support home 2x2 stats and no week-tracker line.
  - Attendance week/status dropdowns and notes modal.
  - PWA native install prompt on Android Chrome over a real HTTPS origin.
  - Admin cohort week-title editing.
  - Support group prayer focus selection and admin group prayer grid.

## Errors Hit & Fixes

- Running full schema SQL against the live project caused errors such as `PendingChange already exists`; fix is to run only migration files.
- `gh auth status` reported an invalid GitHub token, so PR creation was skipped.
- Android install prompt was not appearing in emulator/local cases because Chrome only exposes `beforeinstallprompt` when PWA installability criteria are met; UI was adjusted to avoid showing a fake install action.
- User feedback rejected the week tracker line and oversized dashboard layout, so the tracker line was removed and quick stats remain compact in a 2x2 grid.
