# Session: Hub roles (step 5b) — decisions, plan, migration written

**Date:** 2026-09-26
**Branch:** main
**Session ID:** 351056e6-e12a-4e94-ae0b-04f949ae861c

## What Was Done
- Agreed Hub roles design with Olamide (full decisions in memory `fof-hub-roles-decisions.md`).
- Approved plan: `~/.claude-sam/plans/shimmering-wishing-sparkle.md` (plus two later additions below).
- Sonnet agent wrote migration `supabase/migrations/20260926120000_hub_roles.sql` (1040 lines, NOT applied, NOT tested on DB) and API/types. `tsc --noEmit` clean.
- Audit of "support has no group" spots done; Olamide approved the change list.

## Files Changed
- supabase/migrations/20260926120000_hub_roles.sql (new, untracked)
- frontend/src/types/index.ts, frontend/src/services/supabase-api.ts, frontend/src/services/api.ts (modified, uncommitted)

## Key Decisions & Patterns
- 3 support kinds per cohort (`UserCohort.supportKind`): PARTICIPANT_SUPPORT / HUB_LEAD (leads supports only) / OPERATIONAL (IT, 2+ hubs, via new `HubItSupport` table; Olamide is one).
- Hub jobs on `SupportHub`: leadUserId (announcements), assistantLeadUserId, recapLeadUserId, prayerLeadUserId.
- Hub meeting = Sunday recap meeting. New walk-through (Attendance → Prayer [hub members + scrollable shared Faith Projects, full names] → Review & Recap → Announcements → Notes → Submit) replaces the "Recap attendance" tab. Model on `components/groups/MeetingModePanel.tsx`.
- Assistant permissions granular, set by hub lead: `SupportHub.assistantPermissions` default {MEETING} (time + link); lead can add ATTENDANCE, MESSAGE. Checks via `app_hub_can(hub, perm)`.
- Role intro popup when first assigned (`HubRoleIntroSeen`, `unseenIntroJobs` in hub view); re-open by tapping own name label in My Hub.
- Participant switch "Include my Faith Project in the general prayers" (`FaithProject.sharedForPrayer`, off by default). Participants never see the word "hub".
- Unchanged: participant views, support's group meeting walk-through (one Faith Project/week), hub lead meetings stay out of app.
- No-group supports: Home hides group bits → My Hub; Participants/Onboarding empty state → My Hub; Admin Supports shows them normally with kind label; they still get after-class feedback prompt.
- New API: supportHubsApi.update/setAssistantPermissions/getItSupports/setItSupports; myHubApi.getMyHubs/getHubView/submitMeeting/reopenMeeting/prayerList/markRoleIntroSeen; supportKindApi.set; participantAppApi.setPrayerShare. `get_my_hub` signature unchanged (additive); new get_my_hubs, get_hub_view.

## Backend / Handoff Notes
- Olamide applies migration himself: `! node scripts/apply-migration.cjs supabase/migrations/20260926120000_hub_roles.sql` — only AFTER main chat reviews it and runs rewritten get_my_hub for every support in a rolled-back txn (main chat only; subagents never touch live DB).
- push-reminders deploy also by Olamide.

## Pending Tasks
1. Review migration + rolled-back test of get_my_hub/get_hub_view/hub_prayer_list.
2. Olamide applies migration; verify via PostgREST.
3. UI (Sonnet agents): Admin Hubs roles modal + IT supports + Admin Supports kind picker; My Hub labels/prayer list/assistant permission switches/hub switcher; HubMeetingPanel; role intro popup; Support Home role card + no-group handling; Participants/Onboarding empty states; participant prayer switch.
4. push-reminders hub block: personal "you're leading X" line + IT supports (check no backlog blast).
5. Playwright verify all roles on localhost:5173; add Phase 16 to Test Checklist artifact; commit/push after Olamide's review.
- Still waiting on Olamide: Support Break length (step 5).

## Errors Hit & Fixes
- context-saver skipped this session because a "no work" stub was saved at /clear; this file replaces that index row.
