# Session: Declutter all apps, recap release times, notification audit

**Date:** 2026-09-25
**Branch:** main
**Session ID:** 1fd3a0b8-5aa4-4676-ac6e-934d89510a05

## What Was Done
- Clutter review of all three apps (Playwright screenshots as admin, support and participant). Reported 13 items; Olamide approved all of them.
- Built the clean-up (commit 7fd75b9, local only):
  - Home quick actions are always 4 and never repeat the bottom bar. Support: Join call / My Tasks / Resources / Recap. Participant: Join call / Message support / Resources / Feedback.
  - Dashboard and Supports show group meeting summaries; the full grid stays on Group meetings.
  - Attendance totals come first, and the follow-up list starts folded.
  - Schedule and Activity overview have a single week picker; the Focus box is removed.
  - Onboarding feed shows the latest 5. Faith projects drops the Category and Title columns.
  - Users: role change moved to the row menu, with a confirm step.
  - Settings is grouped into Programme / Just for you.
  - One Logout on desktop. The help button sits in the desktop top bar and floats on mobile.
  - Support schedule, profile and attendance buttons tidied.
- Recap release times (commits 77e0ac2 and c58ef1b):
  - Supports get the recap at Sunday 4pm on the new /support/recap page, with a push and bell alert. Participants get it at Monday 6pm.
  - The share switch is kept, and "Send to participants now" releases early.
  - Settings › Programme › Timings edits both times.
  - Migration 20260925060000 was APPLIED to live (by Olamide via `!`). push-reminders was DEPLOYED (version 17).
- First push-reminders deploy sent 4 old-week recap alerts at once to the ZZ Demo supports (Test Support, Olamide Irojah). Fixed so only the newest week is announced, and redeployed.
- Notification audit artifact published (57 alerts plus 6 problems found): https://claude.ai/artifact/7pJz1HJPvVxiUFMwTsY9RR
- Test Checklist artifact updated with Phase 9 (clean-up, 15 checks) and Phase 10 (recap times, 8 checks): https://claude.ai/artifact/8Bi73TwdRiqUSnNxf8SvoA
- Deacon meeting notes folded into the roadmap memory:
  - Hub roles: Hub Lead, Assistant Hub Lead, Recap Lead (renamed from Teachers), IT Support (= operational hub support, back in scope), Prayer member.
  - Class manual goes out Thursday evening.

## Files Changed
- frontend/src: AppShell, NeedSupportButton, NotificationSettings, UserManagement, WeekSelector, dashboard/DashboardParts, and the Admin* / Support* / Participant pages listed in commit 7fd75b9.
- New: pages/SupportRecapPage.tsx, utils/recapReleaseTimes.ts.
- App.tsx, CohortsPage, AdminSettingsPage, services/api + supabase-api, types.
- supabase/migrations/20260925060000_recap_release_times.sql (applied).
- supabase/functions/push-reminders/index.ts (deployed).

## Key Decisions & Patterns
- Home quick-action tiles are ALWAYS exactly four, with none repeating the bottom bar.
- Support recap time is independent of the share switch. The switch only holds recaps back from participants.
- Class Sunday = Cohort.startDate + (week-1)*7. Verified: cohorts start on Sundays.
- Claude cannot apply migrations or deploy functions (auto-mode blocks production deploys). Hand Olamide `!` commands, then verify from the live side.

## Backend / Handoff Notes
- Nothing git-pushed. There are 3 local commits on main (7fd75b9, 77e0ac2, c58ef1b). They need the show-and-confirm push rule, and Olamide has not reviewed the screens yet.
- Live DB and push-reminders already contain the recap changes. The frontend Recap page, Timings card and Send-now button only appear once the frontend is pushed.
- A subagent ran the migration inside BEGIN/ROLLBACK on the live DB. This was disclosed to Olamide, and it was verified that nothing persisted.

## Pending Tasks
- Olamide reviews Phase 9 and Phase 10 locally, then approves the push.
- Olamide fills in the Notification Audit. On "audit done", read the artifact state and apply the changes.
- Next build order:
  - Notification check (re-ask when notifications are off, and list unreachable people).
  - Post-class feedback plus department choice.
  - Faith Project "not going well" plus Testimonies.
  - Support Break mode.
  - Hub roles (labels, role explainer, reminders).
  - The rest of the roadmap.
- Pre-existing: an intermittent React "state update on a component that hasn't mounted" console warning on login. The unused `newResourceCount`/`hasNewHubActivity` TS errors in AppShell and SupportHomePage remain baseline.

## Errors Hit & Fixes
- Port 5173 is used by another project. Run FOF dev on 5174 (`npx vite --port 5174 --strictPort`).
- The help button still overlapped table actions after a small move, so it was moved into the desktop header.
- Recap alert backlog blast: support alerts are now limited to the newest released week.
