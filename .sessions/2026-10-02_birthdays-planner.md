# 2 Oct: birthdays, Planner redesign, test-cohort switch

## Built (all pushed to `main`, last push `973775a`)
- **Birthdays** (`/birthdays`, admin): Supports and Participants tabs, cohort filter, name search, month filter, countdown ("Birthday is on the 19th"). Migration `20261002400000_birthdays.sql` (`birthdays_list`, `BirthdayAlertLog`); `push-reminders` v35 alerts every admin 2 days and 1 day before. Supports keep `User.birthday` (MM-DD); participants use `dateOfBirth`; only day + month leave the database.
- **Support profile**: optional Birthday (day + month, × to clear) under Age range, saved with `usersApi.saveBirthday`.
- **Planner redesign** (`pages/AdminPlannerPage.tsx`, `components/planner/{YearTimeline,CohortCard,CohortSheet,PlannerBits}.tsx`, new helpers in `utils/planner.ts`): "Right now / Next up" card; red clash banner only when needed; year overview with segment bars showing week counts and hover/tap tooltips; a skipped Sunday draws as a dashed red gap named after the Stops-FOF event; weeks past the usual end are striped; one card per cohort with every week as a cell; **Add cohort** / **Dates** open one sheet asking only for the first-class Sunday (planned cohorts via `planner_set_planned_dates`, real ones via `planner_set_class_dates`); "Edit each class date…" still opens `ClassDatesSheet`. Zoom control and holiday label layout removed. No backend changes.
- **Test cohorts** (Practice = `isPractice`, names starting "ZZ") are hidden on the Planner; ⋮ menu "Show test cohorts" (per browser, localStorage `fof-planner-show-test`), shown with a violet "Test" tag.
- In-app guide: new admin **Planner** section; Birthdays search note; support profile birthday step.

## Findings
- The signup spreadsheet's date of birth is month/day (confirmed). All 15 supports matching by email already had the same birthday saved; the other 24 supports without one are not in the sheet (email or name). 7 participants without a date of birth are in the sheet, not imported (no birth year).
- Cohort 11 and later are projected 17 weeks on from the latest real cohort (Cohort 10); an Easter-type event on a planned cohort can't be pushed back until the cohort exists.

## Not done / next
- Hero photos and phone-menu Connect icons still need the user's input (see `2026-10-02_surveys-landing-404.md`).
- Mid/End built-in surveys still disabled until an admin turns them on.
- Participant date of birth import (7 matches) left undone.
