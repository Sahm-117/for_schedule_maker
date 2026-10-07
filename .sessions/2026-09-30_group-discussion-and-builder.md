# Session: Group Discussion (all steps), group builder leave-out/empty groups, Dashboard line

**Date:** 2026-09-30
**Branch:** main
**Session ID:** 0e2b729f-b20f-4661-adcf-b252dddf9464

## What Was Done
- **Group view for hub leads/admins (step 1, pushed 0518795):** hub lead taps a support's group name in My Hub → `/group-view/:supportId` (meeting, Join call opening outside the app). New assistant permission `GROUPS` ("See groups"). Admin: Groups → ⋯ → "Open group & discussion" (`?cohort=` param).
- **Group Discussion (pushed 2148137):** private per-group discussion (support + that group's participants). Participant My Group tabs `[Discussion | Meeting]` (Meeting default while a meeting is live); support My Group tabs `[People | Discussion | Meetings]`; group page shows "Discussion this week" report + Read the discussion (admins moderate, hub leads read-only) above the meeting card. Post/reply/like/delete own, subtle "Report post" (4 reasons), pin (one per group), Keep/Remove with neutral placeholder, text only, photos tap-to-enlarge (one size smaller), @ tagging picker, swipe-right-to-reply with author tagged.
- **Alerts + orange dot (pushed c87c37f):** DB triggers → `notify-users` (bell + push, no function deploy): tagged person; support when a participant posts; post author on replies; support + all admins on reports. Nobody alerted about own messages; tagged people get only the tag alert. Orange dot on Discussion tab (participant + support) = others' posts/replies since last opened.
- **Group builder (pushed 1b18411):** "Leave out"/"Use again" for supports (stored as `excludedSupportIds` in the cohort's grouping rules JSON), "+ New Group → Empty groups" (N groups, no support/people), builder asks each time when empty groups exist: Fill them first (support already on a group stays, gets matching people; others get a support; Create fills existing groups) or Leave them alone.
- **Admin Dashboard line (pushed 611b342):** "Discussions this week: N posts & replies · in X of Y groups · R reports waiting" under the Planner line; hidden when cohort has no groups.
- **Support's posts alert the whole group (pushed ddfb85a):** every active participant in the group gets "<Support> posted in your group discussion"; tagged people get only the tag alert.
- Test Checklist artifact updated: Phases 28 (group view), 29 (discussion, gd-1…gd-21), 30 (builder). https://claude.ai/artifact/8Bi73TwdRiqUSnNxf8SvoA

## Files Changed
- Migrations (all applied live by Olamide): `20260930100000_group_view.sql`, `20260930120000_group_discussion.sql`, `20260930140000_discussion_activity.sql`, `20260930160000_discussion_mentions.sql`, `20260930180000_discussion_alerts_seen.sql`, `20260930190000_discussion_seen_race.sql`, `20260930200000_discussion_dashboard.sql`, `20260930210000_discussion_support_post_alerts.sql`
- New: `frontend/src/pages/GroupViewPage.tsx`, `components/discussion/{DiscussionFeedView,StaffDiscussionPanel,MentionTextarea}.tsx`, `components/participantApp/ParticipantDiscussionTab.tsx`, `components/dashboard/DiscussionNowLine.tsx`
- Changed: `App.tsx` (route `/group-view/:supportId`), `pages/{SupportMyHubPage,AdminGroupsPage,ParticipantGroupPage,SupportParticipantsPage,AdminDashboardPage}.tsx`, `components/{AppOverflowMenu (tone 'muted'),SegmentedTabs (dot)}.tsx`, `components/groups/{GroupEngineWizard,NewGroupChooser}.tsx`, `utils/{groupingEngine,groupingRules}.ts`, `services/{api,supabase-api}.ts`, `types/index.ts`

## Key Decisions & Patterns
- Discussion tables have RLS on, no policies, all grants revoked — every read/write goes through SECURITY DEFINER RPCs (`participant_discussion_*` with p_token; `group_discussion_*` with session header). Access helper `discussion_staff_access(group)` → SUPPORT / ADMIN / HUB (read-only, via `app_hub_can(hub,'GROUPS')`) / NULL. Removed text returns null except to moderators (support, admin). Admins moderate but can't post.
- Feed builder `build_discussion_feed` + `discussion_post_json` (pinned returned separately; paging by `createdAt`, which defaults to `clock_timestamp()` so same-transaction rows differ). Mentions stored as JSONB `[{kind,id}]`, cleaned server-side to in-group people (max 20); feed returns `members` for the @ picker and author ids for swipe-to-reply.
- Alerts use the vault + `net.http_post` → `notify-users` pattern (like `invoke_hub_message_push`), type `DISCUSSION`; admin report alerts deep-link to `/group-view/<supportId>?cohort=<id>`.
- Olamide's decisions: Discussion before Meetings everywhere; builder asks about empty groups each time (not a fixed rule); when the support posts, the whole group is alerted (migration 20260930210000).
- Every DB change was trial-run in a rolled-back transaction (`disc_test.cjs`, 84 checks) before Olamide applied it; browser checks via Playwright against live backend on localhost:5173 with test accounts; test data deleted after.

## Backend / Handoff Notes
- Claude can't apply migrations; Olamide runs `! node <old scratchpad>/apply.cjs <file>`. The apply script and `node_modules/pg`/playwright live in the 2026-09-29 session scratchpad (`/private/tmp/claude-501/-Users-olamide-fof-schedule/dd408b3f-…/scratchpad`), which may be cleared by the OS — recreate if missing.
- **Test Support (test.support@fofikd.test) is currently switched ON (isActive=true).** It was off before; Claude switched it on/off for tests, then it was found on again (not by Claude). Ask Olamide whether to switch it off.
- A real post "@Test Support Good morning boss" by Demo Amaka Obi in Group Test (ZZ Demo) is Olamide's own test — left in place.
- Cohort 10 has no groups yet, so hub-lead group links and the Dashboard discussion line won't show there until groups exist.

## Pending Tasks
Parked by Olamide as later work (also in memory backlog):
- In-app guide (`frontend/public/guides/app-guide/content.js`) entries for Discussion, group view, builder changes — not done.
- Test Support on/off decision (above).

## Errors Hit & Fixes
- Feed builder first used a temp table inside a STABLE function → replaced with CTEs.
- Paging skipped rows written in one transaction (same `NOW()`) → `clock_timestamp()` defaults.
- Unseen count ignored other participants' posts (`NULL IS DISTINCT FROM NULL` = false) → COALESCE-based own-author check.
- Rare 409 when two loads marked "seen" at once → upsert with `ON CONFLICT` on the partial unique index (migration 20260930190000).
- `AppOverflowMenu` "Report post" needed a quiet style → added `tone: 'muted'` (no change to existing menus).
