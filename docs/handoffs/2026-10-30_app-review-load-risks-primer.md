# App review, the 11 October slowdown, and the primer's Risks section

Date: 2026-10-30. No app, database or function changes; findings and the password-protected primer only.

## Summary
The lag on 11 October came from the whole database stalling on the smallest free instance. The causes were the
Realtime change feed (most likely old installed clients), polling, and pg_net. The primer now has What's new and
Risks sections.

## Live changes
- None. Everything below was read-only, through the Management API SQL endpoint with `read_only=true`.

## Why the app lagged on Sunday 11 October (Cohort 10's first class)
Evidence comes from the database's own statistics (`pg_stat_statements`, cumulative since February) and the app's
timestamps. PostHog started on 28 Oct, and Supabase keeps only about a day of raw logs on the free plan, so there is
no minute-by-minute record of that morning.

- **The traffic wasn't huge.** That morning (Lagos time) had a few dozen sign-ins and bursts of 30 to 40 attendance
  marks around 9:30 and 10:15, with notification bursts at the same times.
- **The whole database stalled.** Many unrelated app functions share the same worst time, about 2.7 to 2.9 s. That
  points to whole-instance stalls, not one slow query.
  - The project runs on the free plan's smallest instance (no compute add-on, shared CPU).
  - 26 of 60 connections are in use at idle.
  - In the last 7 days, `close_attendance_windows_every_minute` and `corporate_prayer_slots_every_minute` each
    stalled to about 10 s and failed once.
- **Database time since February, by part of the app:**
  - Realtime change feed (`SELECT wal->>…`): about 27,600 s, 43% of all database time. The app removed its Realtime
    row listeners on 10 Oct (polling load-shedding handoff), but installed phone apps update late, so old clients
    likely still listened on 11 Oct. No replication slot is active now. `public."Notification"` is still in the
    `supabase_realtime` publication.
  - pg_net response cleanup: about 3,260 s; 93 ms average, 8.8 s worst. Every push and Telegram send goes through
    pg_net.
  - Total database time since February is about 63,600 s, which is the basis for the primer's chart shares.
  - Polling and heavy screens (each figure is total time since February):
    - `practice_pulse`: 37.9k calls, about 2,180 s total.
    - `participant_home`: 9.3k calls, 178 ms average, about 1,650 s total. It is the heaviest participant screen.
    - `corporate_prayer_signal`: 11.4k calls, 103 ms average, about 1,180 s total.
    - `get_my_hubs`: 9.6k calls, 109 ms average, about 1,040 s total.
    - `my_notifications`: 38k calls.

## App review (admin pages, live backend, read-only pass)
- All 32 admin pages opened as the test admin with no errors in the console or on screen. All writes were blocked
  for the pass.
- Slowest on the local dev server (relative, includes background checks): Users about 20 s, Scriptures about 16 s,
  Supports about 9 s, Groups about 8 s, Notifications about 7 s.
- Supports (as the page shows it for Cohort 10, with its own test-account handling): 21 of 22 supports with groups show "Keep an eye on", nearly all for "missing week 1" (only 3 of 23 groups
  reported a week 1 meeting) and onboarding past its 5-day limit. 27 of 49 supports land in "No group". The labels
  stop telling an admin anything.
- The type check fails with 7 errors (`PracticeDock.tsx`, `AdminWebsitePage.tsx`). `npm run build` does not type
  check, so these never block a deploy. Older `no-explicit-any` lint errors sit on Participants and Groups.

## Primer (`sites/project-primer/index.html`)
- New sections: **What's new** (API and Church app access, attendance lock, two-absence review, which groups are
  talking, PostHog, public pages and Bitwarden) and **Risks** (the above, with what to do; database time chart).
- Bitwarden added as a must-have account. The secrets note now says Bitwarden first. Saturday review reminders added
  to the app's clock.

## How it was tested
- Database statistics: `pg_stat_statements`, grouped by function name, ordered by total time.
- Activity on 11 Oct: counts per 15 minutes (Lagos) from `AppSession."createdAt"`, `AttendanceRecord."markedAt"`
  and `Notification."createdAt"`.
- `cron.job_run_details` for the last 7 days.
- Compute size: from the billing add-ons endpoint (no compute add-on selected).
- Not verified: that old installed clients were still listening on 11 Oct. This is inferred from the dates (listeners
  removed on 10 Oct) and the feed's total, and the statistics have no per-day split.
- Admin pages: Playwright as the test admin with a temporary session (deleted), all non-GET REST writes blocked.
- Primer: Chromium at 1280 px (light and dark) and 390 px, with no horizontal scroll and no console errors; then the
  code review fixes.

## Open items (owner decisions)
- Supabase Pro plus a larger compute size before the next big Sunday. This also adds daily backups.
- Remove `Notification` from the `supabase_realtime` publication. Nothing in the app uses it; this is a one-line
  change and needs a yes.
- Fix the 7 type errors, then make `build` run `tsc`.

## Gotchas
- `pg_stat_statements` has not been reset since February, so its numbers are totals, not one day's. Reset it, after
  saying so, before a Sunday you want to measure.
- Load times from the local dev server include background polling ("network idle"). Compare pages with each other,
  not with production.

## How to pick this up
Start with the High risk: the plan upgrade is an account decision for the owner. Removing the Realtime publication
needs a yes. The type check fix is code-only.
