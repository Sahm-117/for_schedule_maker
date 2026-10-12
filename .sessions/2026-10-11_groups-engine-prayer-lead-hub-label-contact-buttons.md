# Session: Groups engine loosened, Prayer Lead gate, hub message label, contact buttons, IT support next meeting

**Date:** 2026-10-11
**Branch:** main
**Session ID:** b000f188-873a-467f-ab6a-feabd5751dcc

## What Was Done
- Group builder (`GroupEngineWizard.tsx`): removed "Planning only" and the signed-in-only rule; everyone not in a group can be grouped, drafts are always real. Empty groups made in the draft are now created too.
- Prayer Lead screen (`HubMeetingPanel.tsx`): only opens once attendance is taken, prayer has started, or it is within the hub's meeting window; otherwise shows "Prayer opens here once the hub meeting starts". Hub Leads/assistants unchanged.
- Hub message alerts now start with "Hub Lead · " / "Assistant Hub Lead · " / "Admin · " (migration `20261016300000_hub_message_sender_label.sql`, applied live). Only new alerts; stored message subject unchanged.
- Support profile popup (`HubAuthorProfileModal.tsx`): Call + WhatsApp buttons for everyone except participants.
- Support Home (`SupportHomePage.tsx`): IT supports' "Next hub meeting" shows their own hub (HubMembership), not the soonest of hubs they cover.
- Week 1 recap delivered as a portrait PDF on the Desktop (`Week1-Recap.pdf`, 5 pages, class-manual artwork, Pastor SA card removed). Olamide uploads it himself.
- FLOW_MAP.md: rules 29 and 44 rewritten, rules 63-66 added (push hook requires a Flow-Map line on each commit).

## Files Changed
frontend/src/components/groups/GroupEngineWizard.tsx, components/hubs/HubMeetingPanel.tsx, components/HubAuthorProfileModal.tsx, pages/SupportHomePage.tsx, supabase/migrations/20261016300000_hub_message_sender_label.sql, FLOW_MAP.md

## Key Decisions & Patterns
- Prayer Lead gating reuses the follow-along rule (`showFollowAlongPrayer`).
- Playwright checks ran with all DB writes blocked and a faked clock (timezone Africa/Lagos); temporary AppSession rows were deleted afterwards.
- Pushes: PAT from `.env.github.local`, no actor block (per memory); commit trailer `Flow-Map: checked` / `n/a`.

## Pending Tasks
- "My Hub" tile on support Home still uses the first hub alphabetically; offered the same fix, not requested yet.
- Real hub-message send not tested (would notify real people).

## Errors Hit & Fixes
- Push blocked by Flow-Map hook: updated FLOW_MAP.md and re-committed with trailers.
