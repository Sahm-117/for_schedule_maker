# Session: Teens step 1 — Teen Support tag, Teenager statuses

**Date:** 2026-10-06
**Branch:** main

## What Was Done
- Spec agreed in chat for teens (18 and below): looked after off the app by Teen Supports, one support per teen throughout, no teen login, teen groups and Sunday attendance on the app, limit per teen support in Settings (default 4), same gender by default with a flagged fallback, parent/guardian phone field, church email `[redacted-email]` for teens with no email, Mobilisation Teen switch assigns straight away. Safeguarding policy drafted (in chat only).
- Step 1 built, applied live and pushed: built-in **Teen Support** tag (old "Teen" tag converted in place, same id, 2 members kept), statuses **TEENAGER** and **TEEN_ONBOARDED**, auto-tag in `fill_profile_from_form` behind `AppSetting.teen_flow_enabled` (currently **false**), adult assignment/reassignment/stale/load counts skip teens, form gate treats teen statuses like Registered, cohort_health counts teens as registered.
- Found and told: Abimbola Oluwaseye was overwritten by his sibling Ibukunoluwa Abimbola (same phone/email) — one record, first form's gender kept. Not yet fixed.
- Hub list checked against Users: every name is a support (Mary Olalokun = Ayomide Mary Faniran, Damilare Grillo = GRILLO OLUWADARE).
- Audio note transcribed locally (faster-whisper in the scratchpad).

## Files Changed
- `supabase/migrations/20261006160000_teen_status_values.sql`, `20261006161000_teen_support_tag.sql`
- `frontend/src/utils/followUps.ts`, `types/index.ts`, `services/supabase-api.ts`, `components/supports/SupportTagsModal.tsx`, `components/followups/{FollowUpDashboard,FollowUpStatusFlow}.tsx`
- `supabase/functions/receive-form-registration`, `run-followup-assignment` (deployed v11 and v6)
- `FLOW_MAP.md` rule 19

## Key Decisions & Patterns
- Age is only known after the status flip on the form path, so the teen decision sits in `fill_profile_from_form`, not a status trigger.
- TEEN_ONBOARDED is closed for the queue but not archived: all of a teen support's teens count to their limit and group.
- Pill colours: Teenager pink, Onboarded emerald.

## Backend / Handoff Notes
- Both migrations applied live and verified (12 SQL checks in a rolled-back transaction; Playwright admin and support, zero console errors).
- Switch stays off until steps 2-3 are live; turn it on then.

## Pending Tasks
- Step 2: teen assignment to Teen Supports (same gender, fallback flagged), teen limit setting (default 4), Mobilisation Teen switch and "no email, use church email" switch, parent/guardian phone, teen follow-up cards with WhatsApp message and "Onboarded" with its reason.
- Step 3: teen groups (one per teen support, filled first, no meeting/recap) and Sunday attendance with a switch back to the general list.
- Step 4: Teen dashboard card, badges, move the 12 existing teens (switch off any logins, not delete), Not a teen, optional policy acceptance gate.
- Fix the overwritten Abimbola Oluwaseye record (create him separately, correct Ibukunoluwa's gender to Female); decide whether a different name on the same phone creates a new person.
- Titilope Shofowora stays as is until a support registers her with the Teen switch.
- Support tags box still shows the example "New tag, e.g. Teen support".

## Errors Hit & Fixes
- Writing migrations, a read-only localhost check and edge-function deploys were each blocked by the safety classifier; the user granted permission or ran the deploys with `!`.
