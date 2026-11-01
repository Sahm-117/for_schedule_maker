# Admin review, batch 4: charts, schedule, approvals, planner, hubs, settings, cross-week fix

Date: 2026-11-01. Frontend only: no migration, no function deploy. Commit `b6d8967`.

## What changed
- **Charts:** small inline SVG components in `components/charts/` (`MiniLine`, `MiniBars`, `RateBar`); there is no chart library.
  - **Attendance:** a trend line of attended % per finished week, shown only in the **All weeks** view. That view already loads every week (two reads a week), so the trend adds no load when the page opens.
  - **Feedback:** after-class average by class. Weeks under 5 responses show "N of 5 needed".
  - **Announcements:** the "Got it" rate is a bar.
  - **Church app access:** requests per day per key, from `api_admin_client_activity`, capped at 200 rows.
- **Schedule:**
  - Cross-Week has a "Copy a standard week" tab (`components/schedule/StandardWeekCopy.tsx`). It skips anything a target day already has and confirms before copying.
  - The Draft chip reads "N activities not published", with a Publish button beside it.
  - Week focus and tags share one row.
- **Approvals:** Add and Delete get before/after columns, and "Approve all (N)" asks for confirmation.
- **Activity overview:** an empty state while no activity carries a tag; otherwise a "By support" view.
- **Planner:**
  - markers for the missed-class warning, the class 3 automatic move and the group leader check-ups;
  - a "Plan Cohort N" button;
  - the sign-up target card moved here from Follow-ups (`components/planner/SignUpTargetCard.tsx`).
- **Hubs:** each hub's group meeting reports for the latest week, and the hub with the most ★-flagged supports.
- **Settings:** cards grouped by who they affect (Participants, Supports, Admins) with a jump list, and an "If you edit this" line under each rule. No keys or behaviour changed.
- **Website:** Preview opens `/website-preview` (signed-in only) with the unsaved draft, passed via sessionStorage.
- **Corporate prayers:** "Copy last cohort's slots" in the ⋮ menu. Cohort 9 has no slots, so it says so today.

## Fix: cross-week edits stayed in every cohort
`activitiesApi.create`, `update` and `delete` with `applyToWeeks` looked weeks up by number across **all** cohorts. "Week 3" meant week 3 of Cohort 9, Cohort 10 and Practice. `resolveWeekRowsByNumbers` and `resolveDayIdsForWeekNumbers` now take the source week's `cohortId`.

I checked live data and found no stray copies in Cohort 9. The read-only `checkDuplicates` still matches across cohorts; it only drives a warning.

## Checks
- `npm run build` passes.
- Playwright as an admin with a temporary session (deleted afterwards), with every write intercepted:
  - 13 pages opened;
  - the standard-week copy, slot copy, Preview popup, All weeks and After class views were clicked through;
  - 0 console errors.
