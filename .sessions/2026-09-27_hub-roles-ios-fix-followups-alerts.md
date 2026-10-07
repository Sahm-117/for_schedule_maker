# Session: Hub roles, iOS fix, follow-ups redesign, alerts live

**Date:** 2026-09-27
**Branch:** main
**Session ID:** 9f51fc2e-e585-4600-9919-33af73bb7295

## What Was Done
Fixed iOS 15 compatibility issue blocking sign-in (AbortSignal.timeout fallback),Built hub role system: labels on names, welcome popups at login, visual role guide with FOF logo in header,Added follow-up features: 'From prior cohort' tag, assigner-first support dropdown, note history with writer/timestamp,Deployed 7 Supabase alert notification services live,Added search functionality to Supports page,Created WhatsApp export for users without alerts (with YouTube setup videos for iOS/Android),Implemented automatic cohort tagging when assigning follow-up contacts,Split form completion tracking: 12 filled form vs 1 added for follow-up (visual distinction),Established standing rule: contacts belong to cohort running/about to start during follow-up,Added chevron indicators to hub role labels

## Files Changed
frontend/src/components/followups/FollowUpDashboard.tsx (tags, assigner-first, note history),supabase/functions/ (7 alert services: notify-followup-assignment, notify-followup-terminal-status, notify-faith-project-submitted, notify-faith-project-review, notify-group-meeting-completed, notify-onboarding-event, notify-hub),supabase/migrations/20260927170000_follow_up_note_history.sql (database schema),Hub roles components (labels, welcome popups, visual guide),Supports page (search box),Role guide tutorial assets (visual walkthrough with FOF logo)

## Key Decisions & Patterns
Hub role welcome shows as full visual guide at login once per role, not just in My Hub,Contacts follow-up cohort rule: belong to cohort running/about to start during follow-up, not current cohort,Note history automatically records writer name and timestamp for all notes, immutable,Alert setup via WhatsApp with embedded YouTube video links for device installation

## Backend / Handoff Notes
All 7 alert services deployed and verified. Database migration for note history applied and tested. No pending backend work.

## Pending Tasks
Preview and push form completion split (12 filled form vs 1 added for follow-up) — built locally, ready for review,Later: turn off visual guide mode, revert to short popup with 'See how it works' link

## Errors Hit & Fixes
iOS 15 sign-in 'Connection error' — fixed with AbortSignal.timeout fallback for older iPhones,Alert services deployment blocked — all 7 services deployed and live,Follow-up note history missing writer/timestamp — database migration applied and tested

## Effort Routing Suggestions

Several "medium" defaults here should be lowered to match the actual work:

- Entry 1 ("no\nonly admin"): Short scope clarification → should be **low**
- Entry 3 ("run in the prior 5173"): Dev server startup with port spec → matches `/run` skill pattern, should be **low**
- Entry 4 ("/context-saver"): Explicit skill invocation → should be **low** (any slash command is routing, not reasoning)

Entry 2 is borderline but matches Olamide's documented test-checklist workflow, so **low** is reasonable here too.

**Suggested additions to effort-rules.json:**
- Mark prompts starting with `/` → low (skill routing, not reasoning)
- Mark `run`/`dev`/`localhost` keywords → low (dev execution)
- Mark "add to checklist" or "update artifact" → low (documented routine)
