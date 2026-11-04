# Reopen a submitted group meeting report (with "Ask to reopen")

Date: 2026-11-04.

## Summary

A support wanted to correct their submitted week 1 group meeting report (attendance and the rest). Before this, admin "Reopen for the support" only cleared "submitted". The week was past its recording window (rule 77), so the support still could not change anything, and nobody told them. Now:

- **Support** (My Group > meeting card on a submitted week): "Need to change something? Ask to reopen" with a short reason goes to the admins (bell + push). The card then says the ask is waiting.
- **Admin** (Group meetings):
  - A yellow box at the top lists waiting asks, each with Review.
  - In a week's sheet, "Reopen for the support" asks for a reason (filled with the support's reason when there is one), then "Reopen for 48 hours".
  - That clears "submitted", opens the week for the support for 48 hours through the existing recording opening (rule 84), and tells them.
- **Support while it is open:** the card shows "Reopened by the back office until …" with the reason, and the normal steps.
- **Submitting again** locks the week straight away.

FLOW_MAP rule 134.

## Live changes

- Migration `supabase/migrations/20261104130000_group_meeting_reopen.sql`:
  - table `GroupMeetingReopen` (locked);
  - `group_meeting_notify` (internal);
  - `reopen_group_meeting`, `request_group_meeting_reopen`, `group_meeting_reopen_state`, `group_meeting_reopen_requests`;
  - the trigger `group_meeting_reopen_close` on `GroupPrayerStatus`.
- No edge function changed (it uses `notify-users`).
- **Applied live on 4 Nov 2026** (Management API, one transaction). Checked afterwards: 6 functions and the trigger present, the table is locked (row-level security on, no public key access), the notify helper can't be called with the public key, the app functions can, and the table is empty.

## How it was tested

- **Database:** a rolled-back transaction on the live database, with a Cohort 10 group's submitted week 1:
  - **Before reopening:** the support can't edit (MEETING_WINDOW_CLOSED), and a reason under 3 characters is refused.
  - **Asking:** two asks send one admin notification; another support and support-side listing are refused.
  - **Admin list:** shows the ask.
  - **Reopening:**
    - A support can't reopen, and no reason is refused.
    - An admin reopen gives about 48 hours, sets submitted to false, sends one notification and clears the ask.
    - The support can then mark attendance.
  - **Resubmitting:** removes the opening and sets `resubmittedAt`, and the support is blocked again.
  - **Access:** the public key can't use the helper or the table.
- **Browser:** local app as the test admin at 390 px, with the reopen calls answered in the browser and every other write blocked. The waiting-ask box, Review, the reason box filled with the support's reason, and Reopen for 48 hours with its confirmation were all checked; no console errors.
- **Not browser-checked:** the support's side ("Ask to reopen", "Reopened until …"). Signing in as a real support for a check was declined, and Practice has no test support with a group. It was type-checked and built, and its database calls are covered above.
- `npm run build` passes.

## Open items / gotchas

- The support's card reads the reopen state when the group is chosen and after a submit. If an admin reopens while the support has the page open, the support must reload (or open it from the notification).
- Resubmitting adds a new meeting note if they wrote one; the earlier note stays.
- The older admin "Open meeting" (rule 84) still exists for weeks that were never submitted.
