# 2026-09-29 — Prior-cohort contacts can be filed as Attended

Working style the user wants: share understanding first; UI mock-ups always as rendered screenshots plus a short explainer (not an HTML file); build only on an explicit go. The user has given standing permission for DB updates and pushes to main in this session.

## Shipped (main)
- Admin Follow-ups → Contacts: the "From prior cohort" chip is now a picker (`frontend/src/components/followups/PriorCohortChip.tsx`). It lists past cohorts (COMPLETED/ARCHIVED, or started before the active one), newest first.
- Picking one sets `cohortId` to that cohort, `registrationStatus = 'ATTENDED'`, `nextAction = 'CLOSE'`, `archivedAt = now`. Tapping "Attended <cohort>" again changes the cohort or undoes it (back to no cohort, NOT_REGISTERED, unarchived). Contact history (message/reply/call) is left alone.
- Admin-only. Supports see the chip as a plain label. The status column shows a read-only "Attended" pill.
- Attended counts as closed/`done` in metrics and the funnel. It isn't counted in a support's assigned total, and it gets no "waiting to be assigned" tag.

## Applied to production Supabase (2026-09-29, via the Management API)
- `20260929120000_followup_attended_value.sql`: enum value `ATTENDED`.
- `20260929121000_followup_attended.sql`: `run_followup_assignment` treats ATTENDED as closed in both lists. The live body was diffed as identical to the 20260929090000 version before replacing it.
- Direct `psql` to `SUPABASE_DB_URL` hangs from the cloud container; use the Management API (`api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF/database/query`) instead.

## Open items
- Pre-existing bug on main: the mobile "+ N" follow-up count button in `FollowUpContactsTable.tsx` calls `setAdjustingCount`, which is not defined (TS2304), so tapping it probably throws a runtime error. Not fixed; flagged to the user.
- Not verified against the deployed backend with a real admin login (no app credentials in the container). The UI was verified with the real components and sample data in Chromium.
- Carried over: rotate the DB password and access token pasted in chat; Biodun Bello's number; stale remote branches; SupportHomePage lint errors.
