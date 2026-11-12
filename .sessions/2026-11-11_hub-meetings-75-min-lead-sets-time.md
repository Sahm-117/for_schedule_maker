# Session: Hub meeting duration 75min, lead can set time

**Date:** 2026-11-11
**Branch:** main
**Session ID:** bd73b13a-ee9a-42f5-8a6b-f8cb0ab3093f

## What Was Done
- Updated hub meeting display to show '8:00 – 9:15 PM' (75 min) instead of '8:00 PM'
- Extended Join button availability from 60min to 75min past meeting start
- Extended 'meeting today' green banner to stay visible through meeting end time
- Added 'Change meeting time' affordance on My Hub for hub leads (same UI as admins use)
- Applied database migration enabling hub leads (flagged by existing hub.lead_user_id) to set times
- Tested timing logic, permission rules, and UI in browser with temp test lead account
- Pushed code to GitHub; applied live database migration

## Files Changed
- src/utils/timing.ts (added endTimeOfMeeting, extended JOIN_OPEN_MINS)
- src/components/GroupCallCard.tsx (updated end time logic)
- src/pages/my-hub.tsx (added 'Change' button affordance for leads)
- src/pages/admin/hubs.tsx (updated wording to mention 75 minutes)
- migrations/ (applied permission rule: hub leads can set their hub's meeting)
- .sessions/INDEX.md (session notes committed)

## Key Decisions & Patterns
- Display duration as end time ('8:00 – 9:15 PM') rather than words ('75 minutes')
- Extend all time-dependent affordances (Join, banner) uniformly to 75 minutes
- Reuse existing admin time-setting UI for hub leads; no new component
- Permission check: hub.lead_user_id flag from live data; save locked until lead role confirmed
- Keep wording concise; don't add explanatory text about the 75-minute standard

## Backend / Handoff Notes
None

## Pending Tasks
None

## Errors Hit & Fixes
Edit box Join button initially used 60-minute rule; corrected to match 75-minute timing

<!-- transcript-lines: 1124 -->

## Effort Routing Suggestions

Looking at the routing decisions, I see one clear pattern issue:

- **"still showing" → high is overpowered.** The first four prompts are all session-summarization tasks (summarising a Claude Code session for a session log). These are routine documentation work, not debugging or complex reasoning. The "still showing" pattern is too vague and caught a task that should route to low or medium. Suggest either removing this pattern or clarifying it to match only prompts that contain actual reasoning verbs (debug, fix, trace, why, how) — not "still showing" alone.

- **"list " → low is correct.** The remaining five prompts all start with a list-oriented summarization context and route to low, which is appropriate for routine enumeration work.

**Recommendation:** Remove or tighten the "still showing" pattern. If it's meant to catch status-checking work, add context (e.g., require "debug" or "fix" in the same prompt). Otherwise, let those session-summary prompts fall to the default medium tier, which is safer for documentation.
