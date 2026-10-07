# Session: Form age wording, 18 is a teen, 19 - 24 bucket

**Date:** 2026-10-07
**Branch:** main

## What Was Done
- **Form check:** the live Google Form's age answers had become "18 & below" / "19 - 24"; the app only knew "Below 18" / "18 - 24", so new teens would not have been routed. No sign-up had used the new wording yet.
- **Form wording accepted** (`e7fa0ec`): `receive-form-registration` `isBelow18` and `fill_profile_from_form` accept "18 and below" (plus "18 & below", "18 and under"). Function v15 deployed.
- **18 is a teen by date of birth too** (`adfdcd3`): `age_range_for_age` and `utils/people.ts` use age <= 18 for "18 and below". Nobody was 18 by date of birth at the time.
- **Bucket renamed "18 - 24" to "19 - 24"** (`192ed8f`): functions, 35 participants (incl. 7 stored "18-24"), 22 contacts, 2 supports, 2 saved `grouping_rules_*` settings. Frontend `AGE_RANGE_OPTIONS`, contact modal, `groupingRules` (old saved "18 - 24" reads as "19 - 24"). Only `ageRange` changes; no activity/note/teen triggers fire.
- FLOW_MAP rule 8 updated. Migrations `20261007220000`, `20261007230000`, `20261007240000` applied live; Vercel green.
- **Mistake earlier in the session:** an out-of-date `push-reminders` (v40) was deployed for ~3 min; redeployed from main as v41. Leftover objects from that stale work (`app_nudge_mark_sent`, `app_nudge_done`, `AppNudgeSent`, `AppNudgeTracked`) were dropped with approval. Duplicate nudge commits were discarded, never pushed.

## Pending Tasks
- On the form, set the first age answer to exactly "18 and below" (with "and").
- Form layout: put the parent questions in a section shown only for "18 and below"; parent phone required with number validation; move the WhatsApp number up; drop the "(Optional)" description. Do not reword question titles.
- Then one "18 and below" test sign-up to confirm parent name/number reach the teen card.
- Other older values still stored as-is ("25-34", "35-44", "45-59", "15-17", "Below 15"); the group builder normalises them.

## Notes
- The Apps Script forwards every form column by title; adding questions needs no script change.
