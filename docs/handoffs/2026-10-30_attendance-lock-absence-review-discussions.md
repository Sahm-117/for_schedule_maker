# Attendance locks after Sunday; two-absence review; which groups are talking

Date: 2026-10-30. FLOW_MAP rules 12 (extended), 119 and 120.

## What changed
- **After a class, only admins change Sunday attendance (rule 12).**
  - `attendance_week_locked(week)`: a class is locked to supports once it is finalised, its window has closed, or its
    class day has passed (Lagos), unless an admin reopen's fresh window is running.
  - `mark_shared_attendance` and the `attendance_record_lock` trigger use it. The old exception that let supports
    move Absent to Late or Left early is gone.
  - The support Attendance screen locks too, keeps each mark visible, and says "To dispute someone's mark, message
    an admin." A refused write shows the same words.
  - Admins (`app_is_admin`: ADMIN or Team member) are unchanged.
- **Two-absence review before class 3 (rule 119).**
  - From the Saturday before week 3's class, the admin Dashboard and Participants page show a card listing everyone
    in a group marked Absent for both class 1 and class 2 (Late, Left early, Excused and unmarked are not misses, as
    the owner decided).
  - The admin presses Review, unticks anyone to keep, then Move. Each person moved leaves their group, is archived
    in the cohort, and is set to Will join next cohort (the existing carry-over offers them). Their support is told
    why.
  - Undo per person the same day (Lagos). "Keep everyone" marks the review done.
  - Reminders go to admins and Team members who can see Participants at 4, 5, 6 and 7 pm Lagos that Saturday while
    it is not done (pg_cron `absence_review_remind_saturday`, `0 15-18 * * 6` UTC).
- **"Discussions this week" says which groups (rule 120).**
  - `admin_discussion_summary` adds `byGroup`. The dashboard line now reads "See which ›" and opens
    `/groups?discussion=active`.
  - The Groups page has a "Discussion this week" filter (also applied to teen groups).
  - Each group card says "N posts & replies this week" or "Quiet this week".

## Live changes (all applied to the live database)
- `20261030100000_attendance_locked_after_sunday.sql`: `attendance_week_locked`, `mark_shared_attendance`,
  `enforce_attendance_record_lock`.
- `20261030110000_absence_review.sql`:
  - tables `AbsenceReviewMove` and `AbsenceReviewDone` (locked);
  - functions `absence_review_*`;
  - cron job `absence_review_remind_saturday`.
- `20261030120000_discussion_summary_by_group.sql`: `admin_discussion_summary`.
- `20261030130000_attendance_lock_and_review_fixes.sql`: fixes from the code review (below). Applied twice; safe to
  re-run.

## Code review (before push), all fixed
- A support could press Start on a past class to get a fresh window: `start_attendance_window` now checks the lock,
  and the screen hides Start on a locked class.
- An admin reopen of an untimed week stayed locked to supports: it now opens until finalised again.
- The review stayed open every week after class 3: it now closes at the end of class 3's day.
- A second admin on a stale page could move the people the first one kept: a done review cannot be run again
  (cohort row locked while it runs).
- The review was marked done even when a move failed: done only when every chosen move went through.
- Teens lost their teen sign-up status: they now keep it (rule 28).
- The support told could be none when a person's first group had no support: first group with a support.
- The contact did not get the same fields as the app's Will join next cohort (rule 5): it now does, and undo
  restores every field from a snapshot (tested equal).
- Groups page discussion counts could show another cohort's numbers after switching cohort: reset and cancelled.
- Teen groups count and empty text now mention the discussion filter.
- Not changed: the reviewer thought Team members could not run the review. They can, from Participants, so the
  reminder now links there.
- No edge functions deployed. Notifications go through the existing `notify-users`.

## Tested
- Rolled-back transactions on the live database.
  - Attendance, 8 checks:
    - a support is refused on a held class (by the RPC and by a direct update);
    - a support may mark a future class;
    - a support may mark during an admin reopen, and is refused after it closes;
    - an admin may still edit;
    - no session is refused.
  - Review:
    - the list opens on the Saturday;
    - a Late person is not listed;
    - a support is refused;
    - Move archives the person, takes them out of their group and sets the contact to NEXT_COHORT;
    - Undo restores all three exactly, and a second undo is refused.
  - Discussions: `byGroup` count matches `activeGroups` (6 of 28 this week).
- Live after apply:
  - the review Saturday for Cohort 10 is **31 Oct 2026**, with **22** people on the list;
  - the anon key cannot call the helper functions or read the new tables.
- Playwright, local frontend and live backend, desktop and phone, no console errors:
  - Review, desktop and phone, as the test admin, with the review calls intercepted so nobody was moved: card,
    untick, confirm, result; only ticked ids are sent.
  - Discussions, desktop and phone, as the test admin: the dashboard link opens the filtered Groups page (6 groups,
    counts shown).
  - Attendance lock, phone, in Support view: week 2 shows closed, buttons locked, and a forced tap sent no write.
  - For the Support view check, the test admin was given the Support role and a Cohort 10 membership; both were
    removed afterwards.

## Open items
- Teens on the review list leave their group and are archived but keep their teen sign-up status; their Teen Support is
  told. Nothing goes to the guardian.
- A moved person's participant login stops working once archived. They come back through the next cohort's carry-over.
- The dashboard says "Class 2 of 10" during week 2's week although the class held that week was class 2. Worth a look
  in the app review.

## Gotchas
- `prevContactStatus` is stored as text; cast back to `FollowUpRegistrationStatus` on undo (done).
- The review uses `current_programme_cohort_id()`, not the cohort picked in the header.
