# Profile completion roll-up, email optional, birthdays on the Dashboard and on the day

Date: 2026-10-27.

## Summary
- **Participants page:** a "Profile completion" accordion (closed by default; the closed row reads "56% complete · In a group 67% · Not in a group 23%"). Open: All / Adults / Teens, the overall percentage, and In a group / Not in a group panels (people, complete, to finish, average). "Show who is incomplete" applies the existing Profile filter. Counts active, non-test participants of the cohort, from the same per-person scores the list already loads, so no extra request.
- **Email is optional:** removed from the completion score and from the "still to fill in" chips on a participant's own profile; labelled "(optional)" on their profile and edit form. Adding an email was already optional.
- **Dashboard (admins only):** a Birthdays card with today (highlighted, "Make graphic") and the next 14 days, Everyone / Supports / Participants, using the same `birthdays_list` feed as the Birthdays page.
- **Birthday alerts on the day:** admins now also get "Birthday today", as well as 2 days and 1 day before.

## Live changes
- Migration `20261027100000_profile_email_optional_birthday_on_the_day.sql` applied live (`profile_completion_for` without email; `birthday_alerts_due` returns 0, 1, 2 days). Both functions keep their grants (checked: `profile_completion_for` still executable by anon/authenticated, `birthday_alerts_due` still not).
- Edge function `push-reminders` deployed as **v59** from the repo (v58 before). The only code change is the birthday loop (`[2, 1, 0]` and "today" wording). I did not byte-compare the repo file with the live v58 source; the 2026-10-22 handoff says they matched.

## Decisions and why
- Removing email changes scores in both directions. Live Cohort 10 check (active, non-test, non-practice): complete (100%) stayed 28 of 87; the average went from 78% to 74%, because most people have an email, so dropping a finished item lowers partial scores. Only people with no email (2) score higher. Expected, not a bug.
- The Dashboard Birthdays card is for admins only, matching the Birthdays page (`birthdays_list` refuses non-admins).
- The card does not list "what is missing most": the server returns only a count of missing items, not which.

- Someone whose only missing item was email no longer sees the "Finish your profile" row on their Home or the "to finish" count (no server nudge reads the score; checked `supabase/functions`).
- The alert mark in `push-reminders` still runs once after all lead-time groups (unchanged from before); if one group's send throws, that run's alerts are not marked and the next run re-sends. Pre-existing, not changed here.

## How it was tested
- Frontend `tsc` and `npm run build`; mocked-backend Playwright at 1280 and 390 wide for the accordion (closed and open) and the Dashboard Birthdays card, no console errors. Not tried against live participant data.
- Live: completion before/after counts above; `birthday_alerts_due()` returned one participant due today after the migration (it only reads; nothing was marked).

## Open items
- The first run of the new alert may notify admins about a birthday already due today when v59 went live (late evening Lagos time).
- Admin guide has no entry for either card.
- Per-item "most missing" list would need `profile_completion_for` to return which items are missing.

## Gotchas
- The Dashboard no longer carries the profile card (it lives on Participants); Birthdays lives on the Dashboard only.
