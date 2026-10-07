# Session: Training reminders and guide completion

**Date:** 2026-09-28
**Branch:** main
**Session ID:** 9186bd8c-4a72-48f6-a22f-788bed237798

## What Was Done
Redesigned help guide UI for friendliness: topic card home, one topic per page, numbered steps, phone-framed pictures,Wrote support guide with 16 topics and 59 how-to answers, each with real app screenshots,Wrote participant guide with 12 topics and 39 how-to answers with screenshots,Added question-mark help button to participant app (was admin-only),Took ~70 real screenshots with names/numbers redacted, tested on both phone and desktop,Exported full 193-page PDF guide (all three roles, all answers open) to Downloads,Pushed guide live to main branch; verified live on fof.tcnikorodu.org and for-schedule-maker.vercel.app,Checked trainings schema and reminders code; found trainings store date only, no start time or reminders yet,Planned training start-time and 15-minute attendance reminder feature (copy existing follow-up alert pattern)

## Files Changed
frontend/public/guides/app-guide/index.html — guide page redesign (role home with popular questions + topic cards, one topic per page, numbered steps, phone-framed shots, mobile overflow fix),frontend/public/guides/app-guide/content.js — built from scratchpad guide-admin/support/participant.json via build-guide.py,frontend/public/guides/app-guide/shots/support-*.jpg + participant-*.jpg — new phone screenshots (names/phones masked),frontend/src/components/participantApp/ParticipantShell.tsx — ? help button added for participants (floating on phone, header on desktop),frontend/src/components/AppGuideModal.tsx + NeedSupportButton.tsx — committed from earlier session. All pushed in 57e3581.

## Key Decisions & Patterns
Guide content separated by role (admin 26, support 59, participant 39 answers) with role-specific screenshots,Picture optimization done client-side only (not bundled); no performance impact,Training reminders to follow follow-up alert pattern (repeat until work marked, then stop),Participant app gets help button same as admin/support (no exclusion)

## Backend / Handoff Notes
Training reminder not started (no code written). Plan: add startTime (HH:MM, Lagos) to SupportSession + time input in SessionFormModal (components/supports/SupportTrainingsPanel.tsx) + supportSessionsApi create/update; new edge function modelled on run-followup-assignment with a claim-by-unique-insert log table (sessionId, windowStart), pg_cron every 5 min via vault secrets like invoke_followup_assignment; from start+15 min, nudge training_markers users every 15 min until all active supports are marked (stop at Lagos midnight); types PRE_COHORT_TRAINING/GET_TOGETHER only. Temporary ZZ Demo Group change for screenshots was fully undone and verified.

## Pending Tasks
Add optional start-time field to training create/edit (time picker),Build 15-minute post-start attendance reminder (repeating until all marked),Test training reminders end-to-end in local app pointing at prod backend

## Errors Hit & Fixes
28 pre-existing TypeScript errors in other files found during type check; none in changed files

## Effort Routing Suggestions

Looking at the routing decisions, I see a few clear issues:

• Entry at 14:33:26 — `/context-saver` routed to `medium` (default). This is a pure skill invocation with no reasoning; should be `low`. Add pattern: `"^/context-saver$": "low"`

• Entries at 14:33:27–29 — Session summaries routed to `high` via pattern `"design the"`. The prompt fragment "design the" is too broad and matches generic summarization tasks that should stay `low`. Narrow or remove this pattern; if it exists to catch actual architecture/design prompts, add a stricter anchor like `"^design the"` and verify it doesn't fire on session-log summaries.

• Entry at 13:55:01 — Agent handback routed to `low` via pattern `"list "`. Agent messages are system notifications, not user queries; routing them at all adds noise. Consider filtering agent-message and task-notification prompts out of effort routing entirely (they're infrastructure, not user effort signals).

• Entry at 14:24:00 — "push it then drop the pdf" routed to `medium` (default). Contains a push action and should match the existing `push` pattern if one exists; if not, it's being under-routed. Check whether push patterns are firing correctly.

Otherwise, the `low`/`medium` baseline routing looks sound.

## Later in this session (added manually)
- Login message (components/participants/LoginDetailsCard.tsx): now "Hello X, well done on registering for FOF! … If you have any questions, just ask me. See you on October 11." Date comes from the cohort start date via a new `startDate` prop (passed from SupportMobilisationPage, AdminParticipantProfilePage, AdminParticipantsPage); falls back to "Sunday" once the start date has passed. Pushed in 81057b6, verified in the live bundle.
- MessageTemplate rows (live DB, no deploy needed): 15 of 19 edited. Cohort 9 → Cohort 10; no em dashes anywhere (onboarding names now "Day 1: Intro DM" etc.); typo fixes; app mentions added (login after registering, Get ready list, Onboard page, profile photo); First message no longer assumes Selfie Sunday/First Timers Hangout. Original texts are in this chat's transcript (the scratchpad backup was overwritten by mistake); round-2 "before" copy is scratchpad/templates-before-round2.json.
- Olamide: no em dashes in copy; all supports attended a previous cohort; the WhatsApp group link template is still correct.

- Login/invite message updated again (a518189, verified live): "Hello {participant first name}, well done on registering for Foundation Of Faith! / My name is {sending user's name}, from TCN Ikorodu, here to get you onboarded on to the FOF App. / Please find your login details below. / App link, Username, First-time password / … See you on {cohort start, e.g. October 11}." Sender name comes from the logged-in user (useAuth); app link is the site the sender is on.

## Still pending
- Training start time + attendance reminder (not started; plan under Backend / Handoff Notes above).

## Final additions (added manually)
- Login/invite messages always link to https://fof.tcnikorodu.org/login (d5255b3). vercel.app NOT redirected, so existing PWA installs keep working.
- Follow-up steps after sign-up (ae9ff34, migrations 20260928170000 + 20260928180000 applied, notify-followup-terminal-status v12 + receive-form-registration v7 deployed): Login shared is open; Participant confirmed access (ACCESS_CONFIRMED) closes and is set automatically by trigger trg_followup_access_confirmed when the participant sets their password (support gets bell + push); Issue with login (LOGIN_ISSUE) open. Supports only move forward once Registered (admins can pick any). Step strip FollowUpStatusFlow on each card. Backup table FollowUpContactStatusBackup_20260928 (4 Cohort 9 rows, unchanged).
- IT Support login issues (d82367b, migration 20260928190000 applied, notify-followup-terminal-status v13): Issue with login asks for a description (FollowUpLoginIssue table); alerts admins + the owner's hub IT Support (HubItSupport); IT issues tab (last tab on Mobilisation, swipeable tabs, ?tab=it) with details, WhatsApp, login code, Mark resolved → ACCESS_CONFIRMED if signed in else LOGIN_SHARED; auto-resolves and tells IT if the person signs in first; ? button messages first IT Support with a phone (hub, then cohort, then support_contact); Profile explains why the phone number is needed.
- Test Support account is switched OFF (someone deactivated it before this session's tests); it was turned on only during tests and restored.
- IT Support without a phone: Akinsola Fakolujo (Hubs 5 & 6, Cohort 10).

## Still pending
- Training start time + attendance reminder (not started; plan above).
