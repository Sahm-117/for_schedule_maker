# Session: Participant welcome guide, form → profile fill, support gender/age, avatar menu

**Date:** 2026-09-27
**Branch:** main
**Session ID:** 938db015-81c6-4c51-8098-b35952b8e431

## What Was Done
- Participant welcome: after setting their password, participants see the "Welcome to FOF Ops" visual guide (`frontend/public/guides/welcome-to-fof.html`, built in Claude Design) in a full-screen modal. It replaces the old Welcome popup + Home tour for participants. FOF logo in place of the phone/apple art, subtitle "Your FOF companion app", and a Done button on the last screen that closes it (via postMessage `fof-guide-done`). Pushed `b13df2e`, `718d272`, `35227a1`.
- Form sign-ups fill the profile: SQL `fill_profile_from_form(registration_id)` copies email / gender / age range / occupation / DOB onto EMPTY Participant fields, and also onto the FollowUpContact. The SMART request becomes a NOT_DRAFTED FaithProject draft if they have none, and `participant_faith` returns `fromForm` so the Faith Project page shows "This is the SMART request you wrote on the registration form…". The edge function `receive-form-registration` calls it from `finish()`. Deployed as v6 (Olamide ran the deploy). Backfilled: 31 participants and 33 form contacts. Pushed `eca2272`.
- Faith Project guide example (chapter 5) now says "…with a salary of N700,000 by the end of November."
- Participant source "FORM" ("Reg form") for people the form created (contact source 'Google Form'); 30 updated.
- Supports: new `User.gender` and `User.ageRange` columns (column GRANTs + `safe_user_json`). The Profile page has Gender / Age range pickers that auto-save, a completion bar, and a "Profile complete" badge (photo, gender, age range, phone). The admin Supports list shows the badge, a gender·age line, and tag rows that fold to 2 + "+N". Follow-up contacts and all support pickers (contact table, contact modal, issues panel, admin groups) show "Female · 25 - 34". Pushed `fb0301e`.
- Avatar top-left in both shells (ProfileMenu: View profile / Log out). For admins, View profile goes to /settings.
- Android "Install FOF Ops" bar moved from the top to above the bottom nav so it no longer covers the header. Pushed `8031f8d`.

## Files Changed
- frontend/public/guides/welcome-to-fof.html (new), components/participantApp/WelcomeGuideModal.tsx (new), context/TourContext.tsx
- supabase/migrations/20260927200000_profile_from_form_answers.sql, 20260927210000_support_gender_age_form_source.sql (both APPLIED LIVE)
- supabase/functions/receive-form-registration/index.ts (deployed v6)
- pages/ParticipantFaithPage.tsx, components/FaithProjectGuide.tsx
- utils/people.ts (new: genderAgeLine, supportProfileChecklist), components/ProfileMenu.tsx (new)
- pages/SupportProfilePage.tsx, pages/AdminSupportsPage.tsx, components/followups/{FollowUpContactsTable,FollowUpContactModal,FollowUpIssuesPanel}.tsx, pages/AdminGroupsPage.tsx
- components/AppShell.tsx, components/participantApp/ParticipantShell.tsx, components/PWAInstallBanner.tsx
- types/index.ts, services/supabase-api.ts, services/api.ts, pages/AdminParticipants(Profile)Page.tsx

## Key Decisions & Patterns
- Form fill never overwrites: it only fills empty fields. Age values are normalised to the "18 - 24" style; gender must be Male/Female; DOB is parsed as M/D/YYYY or ISO.
- The "from form" note is computed (draft body == SMART answer and status NOT_DRAFTED), so no new column. It disappears once they edit the draft.
- The Supports page has two row components (group leaders vs "Not leading a group yet"); both use SupportTagRow + ProfileTag.
- User columns use column-level GRANTs. New User columns need `GRANT SELECT/UPDATE (col)` plus an addition to `safe_user_json`.
- Auto-mode blocks edge-function deploys. Give Olamide the `!` command with `cd /Users/olamide/fof_schedule &&` first, or it runs from the wrong folder and fails with a 403.
- Cohort switching in tests is localStorage-only (`fof_active_cohort_id`), so it's safe.
- Demo participant: "ZZ Demo Participant", 08000000010 (Cohort 10, id c4d91265-…). Olamide is using it; password currently FOF-DEMO10.

## Backend / Handoff Notes
- Backups: .sessions/backups/backup-participants-before-form-fill-2026-09-27.json, backup-form-contacts-before-fill-2026-09-27.json, backup-participant-source-2026-09-27.json.
- The Test Support account's gender/age were set during testing and then cleared.

## Pending Tasks
- Delete the demo participant (ZZ Demo Participant) when Olamide says he's done. It counts in Cohort 10.
- The guide's top bar in the app still says "Welcome to FOF" (guide heading says "FOF Ops"). Olamide was asked; no answer yet.
- Participants still never get an in-app install prompt (main.tsx preventDefaults beforeinstallprompt; the banner is staff-only). Flagged; Olamide chose no participant install bar.
- Still from the previous session: commit the migration `20260927190000_funnel_excludes_form_self_signups.sql` (untracked), and check the support-side funnel in utils/followUps.ts.
- The department answer on the form is free text, so it isn't copied to the profile.

## Errors Hit & Fixes
- The Playwright tap on the avatar was blocked on Android by the top install bar. Fixed by moving the bar down.
- The first deploy command ran from frontend/src, so it couldn't find the .env.local key → 403. Re-ran with `cd` first.
- Check constraint `SheetRegistration_outcome_check`: test rows must use a real outcome (e.g. MATCHED).
