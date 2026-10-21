# Hub gender split, "Hide no response and next cohort", move several people in the builder

## Summary
Three frontend changes for admins. The Hubs page shows how many women and men each hub has (and all hubs together). The Participants filter sheet has a switch to hide people whose sign-up status is No Response or Will Join Next Cohort. On the group builder's Draft step several people can be selected and moved together.

## Shipped
- `frontend/src/pages/AdminHubsPage.tsx`: "4 women · 2 men" (plus "N not set") under each hub's name and support count; the title line reads "N hubs · M supports (x women · y men) · Cohort". Gender from `User.gender` through `normaliseGender`. FLOW_MAP rule 86.
- `frontend/src/pages/AdminParticipantsPage.tsx`: toggle "Hide no response and next cohort" in the Filters sheet (chip while on). Applies to the list, the counts on each choice, "Showing N of M" and the export label. Not kept in the address. FLOW_MAP rule 34.
- `frontend/src/components/groups/GroupEngineWizard.tsx`: `picked` is a list. Tapping people toggles them; a sticky bar shows "N selected" with Clear; "Move N here" moves them all to that group or to "Not in a group". FLOW_MAP rule 43.

## Fixed after code review
- Participants: the switch also hides teens marked No Response (their status stays TEENAGER; `PARTICIPANT_SELECT` now reads `FollowUpContact.noResponseAt` as `followUpNoResponse`, checked against the live API). Sign-up status choices stay listed while hidden, so a picked choice is never dropped.
- Hubs: the title line counts the same people as the cards (support accounts), test accounts left out of both.
- Builder: changing the view or the Ages filter clears the selection, so nobody hidden is moved; the selected bar sticks flush to the top of the scroll area.

## Live changes
- None (frontend only). Not pushed at the time of writing: the owner asked to wait for a go-ahead.

## How it was tested
- `npm run build` passes; type errors unchanged (7, Website and Practice files); no new lint errors.
- Not tried in a browser (no admin login or mock here).

## Open items
- Age brackets for two participants the owner says are teens are still 18 - 24; the owner said not to change them yet.
- The hub split counts supports only (hub members), not participants in the hubs' groups.
