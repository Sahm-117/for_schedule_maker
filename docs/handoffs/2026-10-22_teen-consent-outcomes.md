# Teen card: parent consent, can't reach, not interested

## Summary
From the 17 Oct Teen Supports meeting (consent must be obtained; one Teen Support had a teen not interested and two unreachable):
- **Teen card (My Group > Teens):** "Parent or guardian has agreed" tick (shows when it was ticked). Next step asks for consent after the guardian's login.
- **⋮ menu > Mark as:** **Can't reach** (reuses the teen No response flag, rule 28; "Reached them" clears it) and **Not interested** (sheet with an optional note, "Tell the admins"; "Undo not interested"). A small tag under the name shows either.
- **Admin Dashboard, Teens card:** "Parent consent: x in · y not yet" and "Teens to follow up" (name, can't reach / not interested, Teen Support, since, note). Not interested is only a report; the admin marks them Not Interested on Follow-ups once confirmed.
- FLOW_MAP rule 94.

## Live changes
- Migration `20261022130000_teen_consent_outcomes.sql` applied live 2026-10-22: `FollowUpContact."guardianConsentAt"`, `"guardianConsentById"`, `"notInterestedAt"`, `"notInterestedNote"`; new `teen_card_mark`. No edge function.

## Decisions and why
- Stored on the teen's follow-up record, next to the existing No response flag, so the admin Dashboard (which loads contacts) needs no new query.
- Can't reach reuses No response rather than a new state, so reminders and Follow-ups already treat it right.
- Not interested does not change the status: setting Not Interested on a teen takes them out of teen handling, which should be an admin's decision.

## How it was tested
- Rolled-back live transaction, then again against the live function (rolled back), as the teen's non-admin Teen Support: consent set; can't reach flags without changing the teen status; not interested with trimmed note clears can't reach; undo; refused for an adult; refused for another non-admin support.
- `npm run build` passes; type errors unchanged (7); no new lint errors. Not tested in a browser.

## Open items
- The admin follow-up rows link to Follow-ups (teens); they are not filtered to the one person.
