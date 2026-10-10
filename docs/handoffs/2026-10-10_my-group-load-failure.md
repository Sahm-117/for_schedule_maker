# My Group: a failed load shows Retry, not "0 participants"

## Summary
- A support reported "Group 10 · 0 participants" and an empty People tab while the admin view showed the three members. Checked live: the group's members were never removed, and under each support's own
  permissions all 40 live groups showed every member. No leftovers from the deleted groups (no orphaned onboarding rows, nobody in two groups).
- Likely cause: the page reads its people once when it opens (not on a timer), and that read's failure was swallowed into an empty list. During the few hours when every participant lookup failed
  (the Participant to Cohort embed fault, FLOW_MAP rule 55), a support who opened My Group saw an empty group and kept seeing it until a real reload.
- `SupportParticipantsPage.tsx`: a failed read of the people, the group statuses or the single-group fallback now throws, so the page shows its error with a Retry button (an expired session says so; other failures say "Tap Retry").
  The error clears anything from an earlier load, and the page retries by itself when the phone comes back online or the tab is shown again.
- `SupportHomePage.tsx`: a failed participants read keeps what is already on screen instead of blanking the counts.

## Live changes
None. Frontend only.

## How it was tested
Build, type check (no new errors). The API calls for the affected support were replayed with a temporary session (removed) and the permission check ran as a rolled-back test over all live groups.
Browser (local app, mocked backend, support role): with the participants read failing, My Group shows the error card and no "0 participants"; after the failure is lifted, Retry shows "Group 10 · 2 participants".
The original report was NOT reproduced (the sandbox browser cannot trust the proxy certificate for the live site), so the cause is the most likely one, not proven.

## Open items
- Not tested against the deployed backend or a real support login.
