# Session: Phase 2 — Sunday attendance countdown, late rule, participant Attendance tab

**Date:** 2026-09-23
**Branch:** main
**Session ID:** da4bb2b5-1c13-4ac4-a53d-67b19bf1731a

> The index first pointed this session id at `2026-09-23_session-context-cleared.md`
> (auto-written at /clear, before any work). This file is the real record.

## What Was Done
- Phase 2 of `~/.claude-sam/plans/4-pre-cohort-trainings-cuddly-donut.md` built by a Sonnet 5 agent, reviewed by Opus.
- Migration `supabase/migrations/20260923000000_sunday_attendance_late_rule.sql` **applied to prod** (Olamide ran `apply-phase2.js`):
  session `startedAt/startedById/closesAt`; record `lateExcused*` + status CHECK incl. `LEFT_EARLY`; admin-only `AttendanceExcusal`;
  `enforce_attendance_record_lock` trigger; RPCs `start_attendance_window`, `excuse_lateness`; `close_attendance_windows` on
  pg_cron `close_attendance_windows_every_minute` (+ `invoke_attendance_absence_push`); replaced `mark_shared_attendance`,
  `notify_attendance_report`, `cohort_health`, `cohort_people`, `participant_home`.
- Frontend: Support/Admin attendance pages (Start, countdown, Left early, Excuse lateness), admin profile shows excusal note,
  participant Home countdown card (new `components/participantApp/AttendanceCountdownCard.tsx`), My Journey Journey/Attendance tabs,
  `attendanceWindowMinutes` in Settings rules, counting in `programmeRules.ts` / `healthModel.ts`.
- Playwright verified all P2 checks on ZZ Demo Cohort Week 7 (id 43); one bug fixed (Attendance tab hid out-of-schedule weeks).
- Pushed `cad420c` to main; GitHub status shows Vercel for-schedule-maker + backend deploys succeeded. Test rows cleaned up (week 43 empty).

## Key Decisions & Patterns
- New RPCs use header-token pattern (`app_is_staff()`/`app_is_admin()`, no `p_token`) — matches newest attendance RPCs, not the plan wording.
- Admins may edit a finalised week directly (any change); non-admins only Absent → Late/Left early.
- Health "missed weeks" counter now includes unexcused Late/Left early; support report "X attended" uses the excusal rule.
- Impact accepted: 7 LATE rows → 5 people's % dropped (Christopher Ayodele 80→60, Kufre Elijah 100→0, Precious Olorunfemi 100→86, Toyosi Morakinyo 60→40, demo Tunde). Admin can excuse via appeal.
- Noon `auto_finalize_sunday_attendance` stays as fallback for weeks nobody started.

## Pending Tasks
1. **Phase 3 — Hubs** (fresh chat). Then Phase 4 (trainings + group-assignment block).
2. Existing security gap (not touched): `send-announcement` and `notify-users` have no caller check.
3. Earlier leftovers: Olamide tidying stale Cohort 10 sheet rows.

## Errors Hit & Fixes
- Test logins (Google Slides "FOF IKD App Guide" slide 25): admin `test.admin@fofikd.test`, support `test.support@fofikd.test`, participants `07019991001` / `07019991002` — ZZ Demo Cohort only. The old "spoof role" trick fails for real admin RPCs.
- `git push` with GIT_ASKPASS got 403 as Prod-Sam103 (keychain/gh helper wins) → use `git -c credential.helper= push` with the askpass helper.
- `npx vercel ls` in `frontend/` says no access to the linked project — deploy confirmed via GitHub commit statuses instead.
- Sub-agent hit a usage limit mid-check; resumed via SendMessage after reset. Prod DDL/writes: prepare script, Olamide runs (cleanup ran fine when he asked directly).
