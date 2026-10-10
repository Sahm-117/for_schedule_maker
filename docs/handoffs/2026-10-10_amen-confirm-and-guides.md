# Amen asks first; guide entries for groups and the hub overview

## Summary
- Prayer screen: tapping **Amen** now swaps the bottom bar to "Are you done praying?" with the time left and **Not yet** / **Yes, Amen**. Only "Yes, Amen" saves.
  The question resets when the prayer or the saved state changes; Amen and Leave are disabled while a save is running. Frontend only (`PrayerSlotScreen.tsx`, also used by the admin Preview).
- App guide (`public/guides/app-guide/content.js`): new admin Groups entry (onboarding chip, five-step bar, hub name, 7-day overdue rule), new support My Hub entry
  (a fellow support's group overview: tiles, onboarding, faith project chip, phone alerts, Send message), and the prayer entries now mention the confirmation.
- The faith project chip on the group overview reads "Faith project: written / not started" (see the earlier commit).

## Live changes
None. Frontend and guide text only.

## How it was tested
Build, lint and type check (no new errors); guide file loads. NOT exercised in a browser; the guide entries describe the screens as read from the code and have no screenshots.

## Open items
- The 7-day overdue limit is the programme default (`onboardingMaxDays`); the guide says "default".
- Guide screenshots for the two new entries are not taken.
