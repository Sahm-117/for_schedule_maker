# Session: Teen messages, teens' WhatsApp group card, parent name, No response

**Date:** 2026-10-07
**Branch:** main

## What Was Done
- **Trigger:** a Teen Support asked whether to call first and what to send after adding teens to WhatsApp; the app had one teen template and nowhere to save a group link.
- **Teen templates (live):** 9 new in `MessageTemplate` (category `TEEN` to the teen, `TEEN_PARENT` to the parent): First message, No reply, Reminder, Not joining, plus parent First message, No reply, Welcome, Reminder, Not joining. Parent first/no-reply ask "is this WhatsApp number good for adding {name} to our group, or is there another number?". Shown only on a teen's card; parent ones first when the card has a parent number. New `{{parent_name}}` ("Sir/Ma" when empty).
- **Message Bank:** admins get a "Who is it for?" choice (everyone / teen / teen's parent) and Teen / Teen's parent chips.
- **My Group, Teen Supports only:** `TeenWhatsAppGroupCard` replaces the Join Call button: "Set WhatsApp group" then "Open WhatsApp Group" with an edit pencil; accepts only chat.whatsapp.com links; stored in the existing `User.whatsappGroupUrl`, which the Welcome templates read. Adults have no WhatsApp group, so nothing changes for them.
- **Parent or guardian name:** `FollowUpContact.guardianName` (migration 20261007190000), a name box on Mobilisation's teen form (`teen_add_prospect` takes `p_guardian_name`), shown on the card. The form handler (`receive-form-registration`) reads parent/guardian name and number answers by wording.
- **No response:** `FollowUpContact.noResponseAt` (migration 20261007200000). Adult: released from the support (owner cleared), left open and unarchived so they can still be grouped; NO_RESPONSE status already keeps them out of assignment. Support is told not to worry, with Undo. Teen: keeps their Teen Support and TEENAGER status, only flagged (a teen always needs a same-gender Teen Support); choosing another status clears the flag. `push-reminders` skips flagged contacts.
- **Bug fixed:** `push-reminders` (since c264902) called an undefined `isSupportOrTagged`, which would crash the 8am owner reminder and the quiet-support sweep. Defined it to match `hasSupportRole`.
- FLOW_MAP rules 27-28.
- Verified with Playwright as the test support and an admin (card, link validation, picker order, preview fill, teen and adult No response, Undo, bank select). Test rows, templates and link removed. `vite build` passes. Both edge functions deployed by Olamide.

## Files Changed
Migrations `20261007190000` to `20261007210000` (all applied live); `FLOW_MAP.md` rules 27-28; `TeenWhatsAppGroupCard`, `SupportParticipantsPage`, `MessageTemplatePicker`, `MessageBankPanel`, `TeenAddFields`, `SupportMobilisationPage`, `FollowUpContactsTable`, `utils/followUps.ts`, `services/supabase-api.ts`, `types/index.ts`; functions `receive-form-registration`, `push-reminders`.

## Key Decisions & Patterns
- Teen No response keeps the owner (same-gender rule) and status; the flag silences reminders. Adults are released.
- Parent detection is "the card has a parent number", no extra field.
- Group link reuses `User.whatsappGroupUrl` (adults never use it).
- Teen switch read ON in the database this session.

## Backend / Handoff Notes
Both edge functions deployed (run by Olamide, not by the agent). Not exercised live after deploy: the 8am reminder and the teen flag skip.

## Pending Tasks
- Add two optional questions to the Google Form after "Age Range?": `Parent or Guardian's Name`, `Parent or Guardian's Phone Number`; then submit a Below 18 test sign-up so we can confirm it reaches the teen's card (not confirmed that the sheet script forwards new questions).
- Admin still sees No response teens/adults only via the status filter; no dedicated list or "released by" shown (admins get the existing terminal-status alert).
- Earlier pending: collect dates of birth; repo private/licence/credit Lightning Growth Consulting.

## Errors Hit & Fixes
- Contacts inserted for QA were invisible until moved into the demo cohort the test support views.
- Two "Close" buttons in the picker; tests click the last one.
