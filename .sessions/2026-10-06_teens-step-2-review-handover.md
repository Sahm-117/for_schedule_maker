# Session: Teens step 2, hand-over info, code review fixes

**Date:** 2026-10-06
**Branch:** main

## What Was Done
- **Teens share phones:** one-phone-per-cohort no longer applies to participants aged 18 and below. Abimbola Oluwaseye restored as his own participant; Ibukunoluwa Abimbola set to Female.
- **Step 2a (database/functions):** `assign_teen_contacts` (HARD RULE: same-gender Teen Support only, no fallback; limit `programme_rules.maxTeensPerTeenSupport` default 4 counting onboarded teens; one run at a time; current cohort only), `teen_add_prospect` (support adds a teen in full, guardian phone, church email `tcn.fof.ikd@gmail.com`, links same-name participant, tells the adult it takes a teen from), admin Assign now merges teen batches, sibling rule in `receive-form-registration` (Below 18 form on a shared phone with a different name = new teen; adult forms never take over a teen's contact), seeded "Teen welcome" template.
- **Step 2b (screens):** Mobilisation "This person is a teen" switch (only when teen handling is on), teen cards (Teen chip, parent number first, Teenager/Onboarded, Onboarded asks what warrants it), teen-only templates with `{{group_link}}`, "Copy my teens for WhatsApp", Settings: Teens card with the on/off switch and "Most teens one Teen Support looks after" (4).
- **Hand-over info:** Follow-up card now says "passed on from <name> <date>" (new RPC `my_followup_handovers`); the alert to a support handed someone says it was passed on, from whom.
- **Code review:** 11 findings reported, 9 fixed (form teen held by an adult is released and the adult told; adult form can't take over a teen on a shared phone; welcome message blocked without a group link; assignment lock and current cohort; alert wording/gating; copy-my-teens cohort/number; stale Onboarded reason; metrics). Left: unused column `teenGenderFallback`, church email in two places (commented).
- Also this session: hub list checked against Users (all are supports), audio note transcribed locally, FLOW_MAP rules 19 and 20 added, rule 3 updated.

## Files Changed
- `supabase/migrations/20261006160000`, `161000`, `170000`, `180000`, `190000`, `200000`
- `supabase/functions/receive-form-registration`, `run-followup-assignment` (deployed v13 and v8)
- `frontend/src/components/followups/{TeenAddFields,TeenOnboardedPopup,TeenSettingsCard,MessageTemplatePicker,FollowUpAssignmentSettings,FollowUpContactsTable}.tsx`, `pages/{SupportMobilisationPage,AdminSettingsPage,SupportFollowUpsPage,AdminFollowUpsPage}.tsx`, `utils/{followUps,programmeRules}.ts`, `services/{supabase-api,api}.ts`, `types/index.ts`
- `FLOW_MAP.md`

## Key Decisions & Patterns
- Teens are looked after by Teen Supports (built-in tag), off the app: no login, groups and Sunday attendance on the app (steps 3 and 4 still to build).
- Same-gender is a hard rule: if no same-gender Teen Support has room the teen waits and admins are told.
- Teen switch `AppSetting.teen_flow_enabled` is **false**; turn it on only after steps 3 and 4.

## Backend / Handoff Notes
- All migrations above applied live; both functions deployed. Edge deploys and some DB writes are blocked by the safety classifier; the user runs deploys with `!`.

## Pending Tasks
- Step 3: teen groups (one per Teen Support, filled first, no meeting/recap) and Sunday attendance (teens only, switch back to general list).
- Step 4: Teen dashboard card, badges, move the 12 existing teens (switch off logins, don't delete), admin "Not a teen" and manual reassign limited to Teen Supports, optional policy gate, Abimbola Oluwaseye needs a follow-up record.
- Titilope Shofowora: a support registers her with the Teen switch.
- Admin checklist tasks for supports (approved plan in progress): admin task from Schedule `⋮`, due day, supports can't delete, optional notes pop-up on tick, Home shows up to 3 with View all.
- Tags box example text still says "e.g. Teen support"; Jeremiah Williams (a teen) is with Olamide Irojah until step 4.

## Errors Hit & Fixes
- Several commands were blocked by the safety classifier (file writes, localhost check, deploys, a DB change) and were cleared by the user.
