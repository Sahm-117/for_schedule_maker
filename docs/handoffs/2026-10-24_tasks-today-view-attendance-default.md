# Fixes: tasks missing on Today, Attendance default week

Date: 2026-10-24. Frontend only. FLOW_MAP rule 106.

## What was wrong
- **Tasks hidden on the support Schedule's Today view.** An IT support had two tasks ("Tasks · 2", "0 of 2 tasks done") but the page said "Nothing for today". The tasks had no day or fell on another day, and the "Anytime this week" group was only drawn when the day also had activities. Fixed: it shows on Today and Full week whatever the day holds, and a line ("N tasks are due on other days this week. Show the full week") appears when open tasks sit on other days.
- **Attendance opened on the class already held.** The week default (`getIdealWeekForCohort`) is the latest class whose Sunday 10 am has passed, so on a Saturday it chose the class held a fortnight ago. Both Attendance pages (support and admin) now open on `nextClassWeek`: today's class on a Sunday, otherwise the coming one, and the last week after classes end. Earlier weeks are still in the week picker, and "All weeks" is unchanged.

## How it was tested
Browser (local app, mocked backend), support login: with no activities and tasks only on another day or with no day, Today shows the hint and "Anytime this week". The Attendance default was type-checked and linted only; `nextClassWeek` is the same helper Home uses for the next-class card. Not seen with a real login.

## Open items
- Other pages still use `getIdealWeekForCohort` (Groups, Participants, Hubs, dashboard cards) on purpose: they describe the class that has happened.
