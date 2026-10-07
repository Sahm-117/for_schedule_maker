# Session: Form sign-up cleanup, list labels, dashboard funnel fix

**Date:** 2026-09-27
**Branch:** main
**Session ID:** c5cf0f09-6b7b-4079-b28c-41cc176f4dea

## What Was Done
- Deleted 6 test form sign-ups (20–23 Sept: Oluwakemi Fakolujo x2, Oribi, Test Test, Exclusive Comps/Chemmy Phacoal, Tunde Adebayo) + their contacts, participants and all linked rows. Backup: `.sessions/backups/backup-test-signups-2026-09-27.json`.
- Olamide deleted 7 rows from the Google Sheet → sign-up row keys (`SheetRegistration.sheetRowKey` = "Form Responses 1:<row>") were shifted. Renumbered the 12 real 27 Sept sign-ups 306–317 → 299–310 to match the sheet. New sign-ups (e.g. IIhechiluru Kalu) confirmed coming through after.
- Mobilisation "Signed up on the form" list: date now shows time with am/pm ("27 Sept, 9:38 am"); single tag "Signed up on reg form" for all (replaced "Added as a new prospect" / "Already a contact"). Pushed `3e9f1dd`.
- "People you registered" → "People you added". Pushed `8c6ee2e`.
- "People you added" now scoped to active cohort (same rule as follow-up list, respects "Show past cohorts"). Pushed `53f2377`.
- Admin dashboard funnel: form self-sign-ups (source 'Google Form', created with replyStatus REPLIED) no longer count as Contacted/Replied unless a support messaged/called them. Migration `supabase/migrations/20260927190000_funnel_excludes_form_self_signups.sql` APPLIED LIVE by Olamide. Live Cohort 10: 23 contacts / 0 / 0 / 19 registered.

## Files Changed
- frontend/src/pages/SupportMobilisationPage.tsx — shortDateTime helper, tag text, heading rename, cohortScopedProspects
- supabase/migrations/20260927190000_funnel_excludes_form_self_signups.sql — cohort_health contacted/replied rules (NOT YET COMMITTED)

## Key Decisions & Patterns
- Row-key gotcha: deleting sheet rows shifts row numbers; app dedupes on "Tab:row" so new sign-ups landing on a reused number are silently dropped as DUPLICATE. After any sheet row deletion, renumber SheetRegistration keys to match.
- Deleting a participant: delete GroupParticipant first (trigger log_group_participant_handover inserts a handover on delete → FK error otherwise), then Participant (cascades).
- Support-added contacts who later fill the form STAY in the form list (that's how supports know they signed up).
- Auto-mode classifier blocks live DB writes/deletes/migrations — write script to scratchpad, Olamide runs it with `!`.
- DB via pooler aws-1-eu-west-2; pg installed in session scratchpad (not a project dep); apply-migration.cjs needs PG_PATH.

## Backend / Handoff Notes
- Damilola Awosusu (test contact, test cohort) NOT deleted — Olamide said leave it.

## Pending Tasks
- Commit + push the migration file `20260927190000_funnel_excludes_form_self_signups.sql` (show-and-confirm push first).
- Browser-check the admin dashboard funnel boxes (Playwright admin run errored internally; DB-level check passed).
- Support-side funnel/metrics in frontend/src/utils/followUps.ts may have the same "form sign-up counts as replied" issue — not checked, not changed.

## Errors Hit & Fixes
- First delete run: FK error on ParticipantHandover from group-leave trigger → delete GroupParticipant before Participant.
- grep on supabase-api.ts returned nothing (tool quirk) — used node to read it.
