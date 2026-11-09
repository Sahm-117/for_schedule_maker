# Participant edit: date of birth field, age range unlock (2026-11-09, session d0277d45)

## Problem
Admin could not change Abisola Alabi's age range in Participants → Edit. The box locked whenever any date of birth was saved.
Her saved DOB is 1904-01-24, a placeholder year from a day/month-only entry. The DB trigger `participant_age_from_dob`
(BEFORE INSERT OR UPDATE OF dateOfBirth, ageRange) ignores ages outside 5–100, so the DB never locked it. Only the form did.
Admins also had no way to edit a date of birth at all.

## Done (commits 9cb62eb, c05edf0, pushed to main)
- `AdminParticipantsPage.tsx` edit modal: new Date of birth field (`BirthDateSelect`) + "Clear date of birth" link.
  A real year fills the age range via `ageRangeFromDate` and locks it. A placeholder year shows a note and leaves the age range editable.
- The teen-line toast now compares against the saved age range (`result.ageRange`), because a DOB can set it in the DB.
- `ParticipantUpdate` type and `participantsApi.create` input accept `dateOfBirth`.
- FLOW_MAP rule 40 wording updated.

## Verified
- tsc -b clean. Playwright (System Admin temp session, all writes intercepted): placeholder-DOB age range editable, save body correct,
  picking 1995 sets 25 - 34 and locks, zero console errors.
- Rolled-back SQL as anon + session header: admin update accepted, trigger behaves as expected.
- Temp AppSession rows deleted (one by Olamide via cleanup script, since the classifier blocked the delete).

## Notes
- Staff Playwright login needs `accessToken = mock_token_<userId>` plus `sessionToken` = raw token of an AppSession row.
- ContextSaver hook failed this session: Anthropic API credit balance too low.
