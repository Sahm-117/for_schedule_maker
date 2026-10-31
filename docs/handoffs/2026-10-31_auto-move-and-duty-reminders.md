# Automatic move after three misses, and reminders for undone duties

Date: 2026-10-31. FLOW_MAP rules 119 (rewritten) and 130 (new). Owner request.

## What changed
- **Three misses move automatically (rule 119).** This replaces the admin's two-absence review.
  - **Saturday before class 3, at 4 pm:** a single warning goes to each support (with their people's names), to each
    participant who missed class 1 and class 2, and to admins.
  - **Class 3's day, from 4 pm:** once class 3's register is finalised, anyone Absent for classes 1, 2 and 3 moves to
    the next cohort. The move is the same as the old admin move, recorded with no actor. Each support hears once, and
    admins get a summary.
  - **Undo:** admins can undo a move for three days (it was the same day before).
  - **Admin card:** shows the warning list before the move, then who moved with Undo. The Move button is gone.
- **Reminders for undone duties (rule 130), in `daily-checks`:**
  - **Supports:**
    - the meeting report, from the morning after the group's meeting day;
    - the hub report (hub lead and assistant lead), from the morning after the hub meets;
    - absence follow-ups past due;
    - hub messages not acknowledged after a day;
    - admin-set checklist tasks past due.
  - **Participants:**
    - the faith project (3 and 1 days before the deadline, on the day, then Mondays and Thursdays), with their support
      told on the same days;
    - the week's reflection, two days after the recap reached them;
    - open surveys they haven't answered (Mondays and Thursdays, from two days after opening).
- The reminder for supports' meeting reports already existed: 20 supports got it this morning, and 19 of them have
  phone notifications on.

## Live changes
- Migrations applied live:
  - `20261031100000_auto_move_three_misses.sql`. New functions `absence_auto_candidates`, `absence_auto_move`,
    `absence_auto_move_due` and `absence_notify_participants`. `absence_review_remind`, `absence_review_state` and
    `absence_review_undo` were replaced. New pg_cron job `absence_auto_move` (every 15 minutes). The admin wording of
    `absence_review_remind` was corrected live after a test; the file holds the final version.
  - `20261031110000_survey_reminders_due.sql`.
- Function deployed: `daily-checks` v21 (`verify_jwt` on, as before).

## Tested
- **Automatic move:** in a rolled-back transaction, the 22 people who missed classes 1 and 2 were marked Absent for
  class 3.
  - All 22 moved, with none skipped: archived, out of their groups, done recorded with no actor, 22 undoable.
  - Nothing was due before class 3's day.
  - Nothing was left behind.
- **Saturday warning:** its messages were built in a rolled-back transaction, with nothing sent: 16 supports, one
  batch of 22 participants, and admins.
- **`daily-checks`:** type-checked with Deno, then run locally in dry-run mode against the live database.
  - **Today:** absence follow-ups to 19 supports, hub messages to 12, one open week 2 hub report (2 people), and
    reflections to 4 participants.
  - **Monday 2 Nov (replayed):** 58 participants get the overdue faith project reminder, and 24 supports are told.
  - The deployed job refuses callers without its secret (401).
- **Admin card:** checked in the browser on Participants: the warning text, 22 people in the list, no Move button, no
  console errors. The test session was deleted.

## Open items
- The first automatic move runs tomorrow, Sun 1 Nov, from 4 pm, for Cohort 10. Check the admin summary and the undo
  list afterwards.
- Surveys with `DATES` timing and no open date get no reminders, because there's no opening day to count from.
- Participant profile reminders ("finish your profile") still exist only before the first class. A weekly one was not
  added.
- Schedule activities (`Activity` with labels) get no overdue reminder. The schedule had one activity with no one
  assigned, so it wasn't worth building yet.
- Participants who are moved get no message about it; their support is told. Decide whether they should be.

## Gotchas
- Local Deno runs of a function need throwaway VAPID keys (`npx web-push generate-vapid-keys --json`) and the service
  role key. Always pass `?dry=1`.
- `daily-checks` skips a support reminder when the same title went to that person in the last 20 hours. Participant
  nudges are once per key in `EscalationNotice`.
