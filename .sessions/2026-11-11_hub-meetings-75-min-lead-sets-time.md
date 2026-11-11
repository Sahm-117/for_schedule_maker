# Session: Hub meetings run 75 minutes; Hub Lead sets their hub's meeting

**Date:** 2026-11-11
**Branch:** main
**Session ID:** bd73b13a-ee9a-42f5-8a6b-f8cb0ab3093f

## What Was Done
- Hub meetings now show as 75 minutes ("Wednesday, 8:00 – 9:15 PM") on My Hub and the support's Home ("Your hub" row).
- Hub Join button (My Hub card, Home, edit box) and Home "Hub meeting today" banner stay up until the end (start + 75), not +60. Group meetings, Hub Leads meeting and the recording window (until midnight) unchanged.
- Hub Lead gets "Change meeting time" / "Set meeting time" on the My Hub card, opening the admins' MeetingSetModal ("Tell the hub" switch).
- New assistant permission in the lead's list: "Set the meeting time" (`MEETING`, already allowed by the DB check and returned as `canMeeting` by `build_hub_view`).
- Migration lets `update_hub_meeting` through for admins OR `app_hub_can(hub,'MEETING')`. Dry-run in a rolled-back transaction: lead OK, assistant with MEETING OK, plain member and assistant without it refused.
- FLOW_MAP rule 78 updated, rule 136 added.
- Verified in Playwright (Hub 5 lead, clock faked to Wed 11 Nov 9:10 PM, save faked, notify off): range shown, Join live 70 min in, Home row "Hub 5 · Today · 8:00 – 9:15 PM", zero console errors. Temp AppSession created by Olamide, deleted after by exact id.

## Files Changed
- frontend/src/utils/joinWindow.ts — HUB_MEETING_MINUTES, `openMinutes` arg on isCallJoinable/meetingTodayState, meetingRangeLabel
- frontend/src/components/JoinCallButton.tsx — optional openMinutes
- frontend/src/components/groups/GroupCallCard.tsx — formatHubMeetingSlot; MeetingCallCard openMinutes
- frontend/src/components/hubs/MeetingSetModal.tsx — openMinutes prop, comment
- frontend/src/pages/SupportMyHubPage.tsx — range, Change link, modal, MEETING permission option
- frontend/src/pages/SupportHomePage.tsx — 75-min join/banner, range in hub row
- frontend/src/pages/AdminHubsPage.tsx — subtitle wording, openMinutes
- supabase/migrations/20261111100000_hub_lead_sets_meeting.sql — permission check only
- FLOW_MAP.md — rules 78, 136

## Key Decisions & Patterns
- 75 minutes is a frontend constant, no DB column (durations were dropped in rule 78; owner asked only for hub meetings).
- Banner wording kept as before (owner: text must not look busy); the range only appears where the time is listed.
- Assistant can set the meeting only if the lead ticks the permission (owner's answer).

## Backend / Handoff Notes
- Migration 20261111100000_hub_lead_sets_meeting.sql must be applied live by Olamide; until then a lead's save is refused with "Only admins can set a hub's meeting".

## Pending Tasks
- Apply the migration live.

## Errors Hit & Fixes
- ContextSaver hook failed: Anthropic API credit balance too low — notes written by hand.
- Auto-mode blocked creating a temp session; Olamide ran the script himself.
- "Get the app" popup blocked Playwright clicks — dismissed in the script.
