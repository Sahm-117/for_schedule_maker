# Wrong Number: left out of the counts, teens keep their label

## Summary
A registered person whose contact is marked Wrong Number is no longer counted as registered on the
Dashboard and Follow-ups Overview. They count again when a correct number is added or the status changes.
A teen marked Wrong Number keeps the Teenager label.

## Shipped
- `utils/registrationOverview.ts`: registered people with a Wrong Number contact (adults: only if not
  signed in) go into a new `wrongNumber` count on each block instead of Registered.
- `RegistrationOverviewCards`: a rose note says how many are left out and why.
- `utils/followUps.ts` `computeFollowUpStatus`: Teenager plus an incorrect-number flag reads as Wrong Number.
- `followUpContactsApi.update`: a teen keeps `TEENAGER` when Wrong Number is set; a changed phone or guardian
  phone on a wrong-number contact clears Wrong Number (reachable again, back on the support's list).
- `FLOW_MAP.md` rule 33 now names this one exception.

## Live changes
- No migration, no edge function.
- One data change: one registered teen's contact set back to the Teenager label (still Wrong Number, still
  filed). Done by a single update on that row, on the user's instruction.

## Decisions and why
- Wrong number means unreachable, so it is the one status that removes someone from Registered (the user's call).
- Adults who signed in stay counted: they reached the app, so a stale Wrong Number does not remove them.

## How it was tested
Frontend build; a small script over `computeRegistrationOverview` (teen and adult wrong numbers leave the
totals, a signed-in adult stays, clearing the flag brings the teen back); Playwright on the Dashboard and
Follow-ups Overview with mocked data (2 left out, note shown, signed-in adult still counted, no page errors).
The save path in `update` (teen label kept, new phone clears Wrong Number) was only built, not run against the
live backend; there is no test runner in the repo, so no committed test.

## Open items
- Editing a participant's own phone (not the contact's) does not clear Wrong Number; only the contact edit does.
- Live check: only two contacts are marked Wrong Number in all, and only one of them is a registered person,
  so no other teen was reset.
- An onboarded teen marked Wrong Number keeps Teen onboarded and stays counted as onboarded.

## Gotchas
- Rule 5: statuses are set with `buildStatusPatch`; the teen label is kept in `update`, because the patch
  builder does not know the contact's current status.

## How to pick this up
Start from `registrationOverview.ts` and `followUpContactsApi.update`.

## Also: "nobody following up" banner
The Follow-ups Overview banner counted every contact without an owner, including people parked as No
response (released on purpose, never assigned). It now counts only open contacts still waiting for a support
(no owner, not test, not filed, not closed, not next cohort), so it hides when there are none.
Source: `FollowUpDashboard`. Built only; the logic was checked against live data (the two unowned contacts
in the cohort are both parked, so the banner is gone). Frontend only.
