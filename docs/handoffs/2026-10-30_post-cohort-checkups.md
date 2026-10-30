# Check-ups after a cohort: a rest week 3 task, then monthly reminders

Date: 2026-10-30. FLOW_MAP rule 121.

## Summary
When a cohort's third rest week begins, every support who led a group in it gets one check-up task. The task is due on
the last day of that week. Reminders follow 1, 2 and 3 months later. It is automatic, daily, and built on the existing
admin rest-week tasks.

## What changed
- `post_cohort_checkups_run()`, run daily at 8:17 am Lagos by pg_cron `post_cohort_checkups_daily` (`17 7 * * *` UTC).
  - The task is "Check-up: check in with each person from your group and note how they are doing".
  - It is an admin rest-week task (`SupportChecklistItem` with `taskGroupId`, no week, `dueDate` = rest week 3's
    Sunday). Supports see it under Schedule > Rest weeks with "From admin". Admins see who has done it in
    Schedule > ⋮ > Add task for supports > Already added (`admin_rest_tasks`, unchanged).
  - The supports get "Check-up on your group". Admins who can see Schedule get "Check-up tasks given" with the count.
  - Monthly reminders "Monthly check-up" link to the support's Participants. One more than a week late is skipped.
- `checkup_rest_week3(cohort)` uses the same dates as `restWeeksAfter` and the Planner.
- `fof_notify(users, title, body, path, type)`: a general bell-and-push helper through `notify-users`, with a
  bell-only fallback.
- `CohortCheckup`: one row per cohort (task group, rest week 3 start, supports given, reminders sent). Locked.

## Decisions (defaults the owner can change)
- Who checks: each support checks on their own group from that cohort (owner's plan; not confirmed otherwise).
- How long: reminders stop after three months.
- No back-filling: a cohort whose rest week 3 has already passed (Cohort 9) gets nothing.

## Live changes
- `20261030140000_post_cohort_checkups.sql` applied live, with cron job `post_cohort_checkups_daily`.
- No edge functions deployed.

## Tested (rolled-back transaction on the live database)
- Cohort 10's rest week 3 begins Mon 4 Jan 2027. For the test, Cohort 9's end date was moved so its rest week 3 was
  today.
- Results:
  - 27 leaders each got one task due Thu 5 Nov;
  - a second run the same day added nothing;
  - "a month later" sent reminder 1;
  - a reminder months late was skipped and counted;
  - 3 sends were queued (and rolled back, so nothing went out).
- After apply: the cron job is scheduled, Cohort 10's rest week 3 is 4 Jan 2027, and `CohortCheckup` is empty (nothing
  fired today).
- The Schedule's wider task filter was not tried in a browser: it only changes the list once a task from another
  cohort exists. It was checked live against the web API and builds clean.

## Code review (before push), fixed
- The task could be hidden once the next cohort became current, because the Schedule only loaded the current
  cohort's tasks. `supportChecklistApi.getForCohort` now also loads open dated tasks from any cohort due in the last
  three weeks or later. This also fixes ordinary admin rest-week tasks. The filter was checked live against the web
  API (HTTP 200).
- A cohort with no group leader was marked done for good: it is now retried the next day.
- The admin count could say "1 supports": the wording now changes for one.
- Rest week 3 could be missed if the job didn't run: there is now a catch-up week, and the due date is at least two
  days ahead.
- Reminder wording claimed exact months and linked to the current cohort's people: it now says "Check-up N of 3" and
  links to the support's tasks. A reminder with no recipients is no longer reported as sent.
- The test-cohort check is now `api_real_cohort`, shared with the API.
- `absence_review_notify` now calls `fof_notify`, so there is one helper.
- FLOW_MAP rule 21 now says an admin task is one with `taskGroupId` set (as the app and guard already read it).
  Rule 121's date wording is corrected and says to change the three date copies together.

## Open items
- If check-ups should include teens' guardians or hub leads, extend the recipient list.
- There is no admin page just for check-ups. The existing rest-task list shows progress; a Planner marker for the
  dates is suggested in the admin review doc.

## Gotchas
- The task's date is fixed when it is given. If the Planner later moves the cohort's end, tasks already given keep
  their date (same as admin rest tasks).
