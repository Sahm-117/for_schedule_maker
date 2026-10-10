# Fix: participant cohort embed broke (registration cards error)

## Summary
- Symptom: the Dashboard registration cards showed "Couldn't check who has signed in" and kept doing so. A retry change (see the registration-overview-retry handoff) did not help.
- Cause: the corporate prayers migration created `CorporatePrayerSkip` with foreign keys to both `Participant` and `Cohort`. The API read that as a second, many-to-many route
  between them, so `Participant?select=*,cohort:Cohort(name)` returned `PGRST201` (300) and every page that embeds a participant's cohort failed.
- Fix: dropped `CorporatePrayerSkip_cohortId_fkey`. The `cohortId` column and the skip feature are unchanged; rows still go with their participant.

## Live changes
(The migration file is prefixed 20261012 only so it sorts after the prayers migration; it was applied on 10 Oct.)
- Migration applied: `20261012090000_prayer_skip_drop_cohort_fk.sql` (drops one foreign key, asks the API to reload its schema). Rollback is in the file (it brings the bug back).
- No edge functions deployed. No frontend change needed for this fix.

## How it was tested
Replayed the real request through the API with a temporary admin session (removed afterwards): the participants request went from 300 `PGRST201` to 200 with all 77 people of
the cohort; the sign-in RPC was 200 throughout; the other Cohort embeds (`Cohort->Participant`, `Group->Cohort`, `FollowUpContact->Cohort`) return 200.
NOT tested in a signed-in browser on the deployed site.

## Open items
- The retry in `RegistrationOverviewCards.tsx` is still there and harmless, but it was not the fix.
- The Dashboard and Participants pages should be looked at once by an admin to confirm they load.
