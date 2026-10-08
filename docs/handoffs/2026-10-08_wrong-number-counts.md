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
totals, a signed-in adult stays, clearing the flag brings the teen back). Not tested in the browser.

## Open items
- Editing a participant's own phone (not the contact's) does not clear Wrong Number; only the contact edit does.
- Other teens already reset to Not registered by an earlier Wrong Number were not searched for beyond the one
  found (live check showed two wrong-number contacts in all, one of them registered).

## Gotchas
- Rule 5: statuses are set with `buildStatusPatch`; the teen label is kept in `update`, because the patch
  builder does not know the contact's current status.

## How to pick this up
Start from `registrationOverview.ts` and `followUpContactsApi.update`.
