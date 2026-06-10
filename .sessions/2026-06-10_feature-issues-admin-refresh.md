# Session: Issues panel overhaul + admin refresh improvements

**Date:** 2026-06-10
**Branch:** main

## What Was Done
- Fixed cascading status rules for registration status changes
- Rewrote FollowUpIssuesPanel with multi-select contact picker, chips, delete/reopen
- Improved admin page data refresh with silent background polling
- Removed redundant message status column
- Fixed owner breakdown calculation logic

## Files Changed
- `frontend/src/pages/AdminFollowUpsPage.tsx` — silent refresh, cascading rules, close filter removal
- `frontend/src/pages/SupportFollowUpsPage.tsx` — cascading rules, close filter removal
- `frontend/src/components/followups/FollowUpIssuesPanel.tsx` — full rewrite
- `frontend/src/components/followups/FollowUpContactsTable.tsx` — phone icon chip, removed message column
- `frontend/src/utils/followUps.ts` — owner breakdown contacted/stillOpen logic
- `frontend/src/context/AppDataContext.tsx` — follow-up table real-time subscriptions

## Key Decisions & Patterns
- API auto-archives when nextAction=CLOSE (existing behavior); cascading rules respect this
- Contacted in owner breakdown = replied + called + missed_call + not_applicable
- Still open = not replied AND not registered
- Multi-select contacts store names in `person` field as comma-separated
- Admin page polls every 30s as fallback, no loading flash on background refresh
- Phone icon rendered as inline chip element instead of separate component

## Backend / Handoff Notes
- `FollowUpIssue` schema's `person` field doubles as multi-contact storage
- `followUpIssuesApi.delete()` was already implemented server-side

## Pending Tasks
- None

## Errors Hit & Fixes
- `res.data` used instead of `res.contacts` in support dashboard — fixed API response field
- Owner breakdown "Assigned" dropped from 15 to 12 due to incorrect archived filtering — reverted
