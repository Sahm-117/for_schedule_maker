# My Group: a failed load shows Retry, not "0 participants"

## Summary
- A support reported "Group 10 · 0 participants" and an empty People tab while the admin view showed the three members. Checked live: the group's members were never removed, and under each support's own
  permissions all 40 live groups showed every member. No leftovers from the deleted groups (no orphaned onboarding rows, nobody in two groups).
- Likely cause: the page reads its people once when it opens (not on a timer), and that read's failure was swallowed into an empty list. During the few hours when every participant lookup failed
  (the Participant to Cohort embed fault, FLOW_MAP rule 55), a support who opened My Group saw an empty group and kept seeing it until a real reload.
- `SupportParticipantsPage.tsx`: a failed participants read now throws, so the page shows its existing error with a Retry button.

## Live changes
None. Frontend only.

## How it was tested
Build, type check (no new errors). The API calls for the affected support were replayed with a temporary session (removed) and the permission check ran as a rolled-back test over all live groups.
NOT reproduced in a browser (the sandbox browser cannot trust the proxy certificate for the live site), so the cause is the most likely one, not proven.

## Open items
- `SupportHomePage.tsx` also turns a failed participants read into an empty list (its counts).
- The page still loads once; coming back to the tab does not reload it.
