# Session: iOS fix, alerts deployment, follow-up redesign, role welcome

**Date:** 2026-09-27
**Branch:** main
**Session ID:** 9f51fc2e-e585-4600-9919-33af73bb7295

## What Was Done
Fixed 'Connection error' on iOS 15 by implementing AbortSignal.timeout fallback for sign-in,Deployed 7 notification alert functions live (followup assignment, status, faith project, group meeting, onboarding, hub),Built and deployed follow-up note history: auto-signs each note with writer name and timestamp,Established cohort rule: contacts follow the cohort running/starting at their follow-up date,Redesigned Follow-ups page: 'From prior cohort' tag, support-who-added-contact listed first, 'Assign to…' link, date/time in details popup,Moved role welcome popup to app login (Home) instead of just My Hub,Built visual role guide with FOF logo as one-time welcome on first app open (temporary feature toggle),Split Cohort 10 completion card to show 12 filled form vs 1 added for follow-up

## Files Changed
frontend/src/components/followups/FollowUpDashboard.tsx — follow-up UI updates,supabase/migrations/20260927170000_follow_up_note_history.sql — note history schema,supabase/functions/notify-* — 7 alert services deployed,Role welcome and visual guide logic — app login flow,hub-roles guide HTML — FOF logo added to header

## Key Decisions & Patterns
Follow-up cohort assignment: contacts belong to cohort running/about to start at their follow-up date, not the current cohort,Role welcome shown once per role per device; reusable via role label tap or 'Role guide' link,Visual guide on first login is a temporary feature toggle; can be reverted to short popup later,Note history auto-signed with writer name; no manual delete capability for history entries (only content notes can be cleared)

## Backend / Handoff Notes
None

## Pending Tasks
Confirm visual guide appearance on real hub member login (switch to toggle it back after initial deploy if needed),Monitor iOS 15+ user sign-ins to confirm fix holds under load,Verify alert function deployments fire correctly end-to-end on production contacts

## Errors Hit & Fixes
iOS 15 sign-in: AbortSignal.timeout not available in iOS 15; added polyfill fallback using setTimeout-based AbortController,Alert functions: deployed 7 services after code fixes to accept app requests correctly
