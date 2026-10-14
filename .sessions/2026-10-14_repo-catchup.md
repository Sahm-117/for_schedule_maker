# Session: Catch-up on the remote repo (16 commits since the last push)

**Date:** 2026-10-14
**Branch:** main

## What Was Done
Read-only catch-up: fetched the remote, fast-forwarded the local copy to the remote head (nothing local was unpushed), read the new commits, FLOW_MAP changes, session notes and the live backend state. No code or database changes.

## What is new on main since the last push
- **Group call limits are now per day** (earliest and latest start for each day, call length no longer limited); the live setting was moved to the new shape; migration `20261015100000_group_meeting_limits_per_day`. The earlier "latest end plus lengths" version is replaced. Not re-tested after the change.
- **Support onboarding checklist** on My Group > People (introduce yourself, participants ready, set meeting time). It overlaps the meeting-time step on the Groups and Supports pages; nothing yet checks that the two agree.
- **Telegram backup copy of notifications**: connect from the profile, bot, `telegram-send` and `telegram-webhook` functions, migration `20261016100000`; practice and test accounts skipped; bot secrets are Supabase secrets.
- Prayer slot notifications skip Practice cohorts; Prayer Lead screen opens only once the hub meeting is on; groups engine groups everyone not in a group; attendance register-closing job fixed and admin Reopen works; hub message alerts say who sent them; support profile popup has Call and WhatsApp; IT support Home shows their own hub's next meeting; Supports cards overlap fixed.
- FLOW_MAP rules 29, 44 and 61 rewritten; rules 62 to 66 added.

## Live backend state
`push-reminders` v50 (has the venue-map and one-off onboarding nudge blocks; does NOT have the roles-and-permissions change, which is still undeployed). Telegram functions, per-day limits, Practice prayer, attendance and hub-label migrations are applied.

## Problems found
- Four participant data backup files from 27 Sep are committed under `.sessions/backups/` (contact details, dates of birth, sign-up answers). An earlier session had deliberately excluded them. They should come out of the history if the repo is public or widely shared. Not touched here.
- No new handoff files since the corporate prayers one; the newer work is only in `.sessions` notes, against the project rule. Some auto-written notes name files that do not exist, so their file lists cannot be trusted.
- Unverified per the notes: the Supports-page overlap fix, the Set meeting time button on a phone, a real hub-message send. The Supports-page meeting-time card and the Dashboard counts (which do not include the meeting-time step) were also never exercised in a browser.

## Pending Tasks
- Check the per-day limits against the picker and the database rule.
- Decide whether the checklist step and the Groups/Supports meeting-time step should share one definition.
- Remove the backup files from the repo history.
- Add the missing handoffs.

## Key Decisions & Patterns
- Fast-forward only when catching up; never rewrite shared history without being asked.
