# Fixes: tasks missing on Today, Attendance default week

Date: 2026-10-24. Frontend only. FLOW_MAP rule 106.

## What was wrong
- **Tasks hidden on the support Schedule's Today view.** An IT support had two tasks ("Tasks · 2", "0 of 2 tasks done") but the page said "Nothing for today". The tasks had no day or fell on another day, and the "Anytime this week" group was only drawn when the day also had activities. Fixed: it shows on Today and Full week whatever the day holds, and a line ("N tasks are due on other days this week. Show the full week") appears when open tasks sit on other days.
- **Attendance opened on the class already held.** The week default (`getIdealWeekForCohort`) is the latest class whose Sunday 10 am has passed, so on a Saturday it chose the class held a fortnight ago. The support Attendance page now opens on `nextClassWeek`: today's class on a Sunday, otherwise the coming one, and the last week after classes end. Earlier weeks are in the week picker, "All weeks" is unchanged, and while the page shows a class that has not opened a button jumps to the last class held. The admin Attendance page keeps its old default on purpose: code review pointed out that admins finalise and follow up the previous class Monday to Saturday.

## Code review
Two findings were fixed: the other-days line counted tasks with no day and tasks hidden by the tick countdown (now only tasks that have a due day on another day), and the admin Attendance default change was reverted. Left as is: the "Anytime this week" card sits in the outer column spacing (cosmetic).

## How it was tested
Browser (local app, mocked backend), support login: with no activities and tasks only on another day or with no day, Today shows the hint and "Anytime this week". The Attendance default was type-checked and linted only; `nextClassWeek` is the same helper Home uses for the next-class card. Not seen with a real login.

## Open items
- Other pages still use `getIdealWeekForCohort` (Groups, Participants, Hubs, dashboard cards) on purpose: they describe the class that has happened.

## Addendum: Home's Today and tasks are one card
The support Home had a "Today" card and a separate "Your tasks" card. They are now one card: today's activities (Mark done as before), then a "Tasks" block with a progress bar, the first 3 tasks (tick, From admin tag, deadline), "N more tasks" and Show completed. The count badge is today's activities plus open tasks, and the footer reads "See the full week and all tasks". The old open/close toggle on the tasks card is gone. The tour step `home-checklist` now points at the Tasks block. Tested in a mocked browser (support login); not with a real login.
