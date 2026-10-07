# 2026-09-16 — DB wiring, auth fix, notifications, Google Sheet lead sync

Session: 5f837bf3 (continued). Branch: `main`. Everything below is pushed and live
unless marked otherwise.

## What Was Done

**Support V2 data wiring (commit d3cce4b → 169907b)**
- Weekly checklist, cover requests, meeting attendance, participant flags, faith
  trail notes, group call link and lead detail fields all save now (were UI-only).
- Recap documents: admin uploads a PDF per week in Cohorts; supports read it in an
  in-app viewer (pdf.js) that minimises to a pill. Resources PDFs use it too.
- Cover requests: support requests cover, operations assigns a covering support in
  Approvals; during the period only, that support sees the away group in My Group
  and can mark Sunday + meeting attendance.
- Home urgent announcement card; bell split into Announcements / Activity tabs;
  Onboard added to the mobile More menu; checklist items hide after a 5s countdown
  with "Show completed".
- Back office extended (not restyled): Approvals cover panel + Dashboard count,
  announcement "show on home" fields, Participants needs-attention badge/filter and
  concerns with Clear, Group meetings joined counts + marking + reopen, Follow-ups
  lead fields and "registered by", Groups call platform/link.

**Authentication fix (38cebea, 17ee5c1)** — the serious one.
- Login never checked the password: any known email signed you in as that person.
  `password_hash` held the plain password behind a `hashed_` prefix and was sent to
  the browser (localStorage + API responses).
- Verification moved into Postgres (`login_user`), values converted to bcrypt in
  place (nobody's password changed), account creation and password changes via
  `create_user` / `set_user_password` / `change_own_password`, explicit column lists
  everywhere, and the password column revoked from anon/authenticated.
- Admin reset forces the person to choose a new password (ForcePasswordChangeModal).
- `admin@fof.com` was the one account with an unknown bcrypt hash — set to
  `admin123@@` at Olamide's instruction.

**Submit-once + week ticks (750c525)**
- A submitted group meeting can't be resubmitted or undone by the support; operations
  reopens from Group meetings. Both week pickers tick weeks already done (meetings:
  submitted; Sunday: attendance complete, with "3 of 5 marked" when partial).

**Notifications (701f0e2, 30809af)**
- One `notify-users` edge function: writes the in-app row first (21 of 39 users have
  no push subscription), then pushes. Targets by ids or by role + cohort.
- Now notified: participant flagged, concern cleared, cover requested, cover assigned,
  recap uploaded, lead registered.
- `daily-checks` edge function for a daily scheduler: cover starting today, meeting
  report still open at week's end (one digest to operations), Sunday attendance
  unmarked from Monday. Idempotent within 20h; `?dry=1` reports without sending;
  requires `x-cron-key`. Scheduled on cron-job.org at 08:00 Africa/Lagos.

**Google Sheet lead sync (uncommitted)**
- Leads registered in Mobilisation are written to a Google Sheet via an Apps Script
  web app. `sync-lead-to-sheet` edge function holds the URL and secret; each lead
  records `sheetSyncedAt` / `sheetSyncError`; `daily-checks` retries failures from
  the last 30 days. Matching on the last 10 phone digits, so retries update rather
  than duplicate.

**Also:** README rewritten to match the app (7136b5c); repo About + topics set.

## Files Changed
- `frontend/src/services/supabase-api.ts` — login via RPC, USER_SELECT everywhere,
  notify() helper, attendance getForWeeks, lead sheet sync trigger.
- `frontend/src/components/` — DocumentViewerSheet, ChecklistAutoHide, CoverRequestsPanel,
  AppDateTimePicker, ForcePasswordChangeModal (new); AppSelect (`done` tick),
  MeetingModePanel, SundayClassPanel, NotificationBell, AnnouncementsModal, AppShell.
- `frontend/src/pages/` — Support Home/Schedule/Participants, Cohorts, AdminApprovals,
  AdminDashboard, AdminParticipants, AdminGroupPrayers, AdminGroups, AdminAnnouncements.
- `supabase/migrations/` — 20260915000000, 20260916000000, 20260916100000 (secure login),
  20260916110000 (create_user), 20260916120000 (no-op revoke), 20260916130000 (column
  grants), 20260916140000 (lead sheet sync columns).
- `supabase/functions/` — notify-users, daily-checks, sync-lead-to-sheet (all deployed).
- `integrations/google-sheet-lead-sync.gs` — Apps Script for the Sheet (uncommitted).

## Key Decisions & Patterns
- No back office redesign — extend existing modules only; it is "already choked up".
- Cover = assign a support, never approve/decline.
- Every push notification also writes an in-app row.
- Test data: always snapshot → restore; block push/notify calls in tests so real users
  aren't paged (missed once — 3 admins got a test notification).
- Migrations additive; deploy the frontend before tightening DB grants.
- Apps Script: paste failures came from long lines + prose swept into the clipboard.
  Fixed by ASCII, ES5-safe, <70-char lines, and `pbcopy` straight from the file.

## Backend / Handoff Notes
- Supabase project `vnmeeqvwqaeczjlvzoul`, pooler host `aws-1-eu-west-2`.
- `pg` is no longer a frontend dependency — install it in the scratchpad for SQL.
- Secrets set in Supabase: CRON_SECRET, GOOGLE_SHEET_WEBHOOK_URL, GOOGLE_SHEET_SECRET.
  Local copies in `.env.cron.local` (gitignored).
- Usage: DB 26.6 MB / 500 MB, files 19.2 MB / 1 GB. Recap PDFs (~5 MB each) are the
  growth driver; bandwidth (~5 GB/mo) bites before storage.

## Pending Tasks
- Commit + push the Google Sheet sync work (migration, function, wiring, .gs file).
- Olamide to decide the target tab (currently `Leads`) and whether updating existing
  rows is acceptable or it should be append-only.
- Delete test rows from the sheet: `ZZ TEST DELETE ME`, `ZZ PROBE DELETE ME`,
  `ZZ FINAL CHECK`.
- Decide: backfill the 33 existing leads to the sheet? Send admin-created contacts too?
- Storage management policy (parked topic).
- 96 dependabot vulnerabilities (45 high) — pre-existing.
- Avatar uploads still 128px; large profile photos look soft.
- Rotate the two GitHub PATs and the Supabase service-role key pasted in chats.

## Errors Hit & Fixes
- `password_hash` NOT NULL broke a client-side insert → `create_user` RPC; `role` is an
  enum so it needed `::"Role"`.
- Column-level REVOKE is a no-op against a table grant → revoke table SELECT/UPDATE/INSERT
  and grant back the safe columns.
- Tightening grants broke `UserCohort → User(*)`; fixed by naming columns (10 min live).
- Apps Script "Manage deployments — an error occurred" = a syntax error in the file.
- Running `doPost` from the editor always fails (no request object) — expected.
- clasp 3.x login is broken (missing `response_type`); use 2.x or avoid it.
- Deploying without switching the Version dropdown to "New version" keeps serving old code.
