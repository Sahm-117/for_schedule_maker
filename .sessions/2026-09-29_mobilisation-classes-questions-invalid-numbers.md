# 2026-09-29 — Mobilisation tidy-ups, Classes page, question replies, invalid numbers

Working style the user wants: share understanding (and a render for UI) first; build only on an explicit go; never push/merge without being told.

## Merged to main
- #8 Mobilisation: Onboarded card (ACCESS_CONFIRMED count) beside Target/Prospects; phones scroll sideways with an arrow hint.
- #9 Mobilisation: removed tabs info tip; Export contacts = current cohort + "Include closed" switch; IT issues info tip beside Open/Resolved. Support "Recap" renamed **Classes** (page, Home tile, in-app guide); next-class top card; weeks locked until the manual is released. Support Home "Next class" tile fixed (Week 1 before start, date subtext, opens Classes). Participant Home: one "Next class" card once the cohort has started (opens /me/week/N).
- #10 Bell: opens on Announcements while one is unread; tab reads "Announcements (N)".
- #11 Classes: weeks in order — Past classes above the focus card, Coming up below.
- This push: questions "N new" badge on one line; participant gets "Your support replied" (push + bell via notify-users) when a support replies to a class-manual question; Follow-ups invalid-number handling (support "Number needs checking" strip with email + Add a working number; admin Overview card "N sign-ups need a valid number" with Fix number; Assign-now reports stuckInvalidPhone).

## Applied to production Supabase (2026-09-29)
- Migration `20260929090000_followup_hold_invalid_numbers.sql`: `followup_phone_is_valid(text)` + `run_followup_assignment` skips invalid numbers (stuckInvalidPhone). Verified live.
- Edge function `receive-form-registration` v8: alerts admins "Sign-up needs a valid number". verify_jwt is on; anon/publishable keys confirmed to reach it.

## Open items
- User to rotate the DB password and access token that were pasted in chat, then update env vars.
- Biodun Bello (WhatsApp "00", owned by Kenneth Alonge) still needs a real number.
- Optional Google Form validation regex for the WhatsApp question: `^\s*\+?[0-9][0-9 ()\-]{8,18}[0-9]\s*$`.
- Stale remote branches to delete by hand: claude/fof-role-walkthrough-ewltt9, claude/mobilisation-onboarded-card, claude/mobilisation-fixes, claude/announcements-obvious, claude/classes-in-order, and the two merged in this push.
- Pre-existing lint errors in SupportHomePage.tsx (unused newResourceCount/resourceCount).
