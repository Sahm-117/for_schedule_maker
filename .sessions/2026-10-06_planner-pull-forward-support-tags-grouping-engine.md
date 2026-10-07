# Session: Planner pull-forward, support tags, grouping engine

**Date:** 2026-10-06
**Branch:** main
**Session ID:** 635237d2-281d-45da-8b19-5c333238c9d6

## What Was Done
- **Planner pull-forward:** unticking "Stops FOF" now offers a green card; preview then Apply pulls classes forward into the freed Sunday via new `planner_pull_forward` (end date comes back by the weeks recovered, never below the usual finish). Cohort 10's own pull (class 3 to 25 Oct, end 20 Dec) was previewed only, NOT applied. Skipped Sunday drawn as light red week with deeper red Sunday.
- **Support tags:** tag manager (Supports page menu), tags added from the builder People step; per-tag rules in the builder (ages, Men/Women/Same gender/Any, own smallest/aim/largest sizes, priority); strict matching (a tag's groups take only tagged supports; tagged supports are last resort for regular groups); tag pill on each group; "Match the group's own age" option.
- **Builder:** leave out an age range per build, unused-supports list with plain-words tips, save a draft and continue it later (AppSetting `grouping_draft_<cohortId>`), gentler support-age note.
- **Admins with the Support tag count as supports** everywhere (shared `hasSupportRole`), plus DB jobs (`notify_attendance_report`, `followup_stale_contacts`, `run_followup_reassignment`) and `push-reminders` (deployed).
- **Support kind follows hub roles** (triggers + backfill): Cohort 10 now has 7 HUB_LEAD, 3 OPERATIONAL.
- **Filters:** Gender and Age dropdowns on Participants and Supports pages.
- **Age from birth:** participant date of birth and optional support birth year set the age range (triggers); 3 plausible mismatches corrected; six 1904 placeholder years ignored. Participant accent colour picker.
- **Process:** pre-push git hook requires a `Flow-Map:` line on every pushed commit (`.githooks/pre-push`, enabled with `scripts/setup-git-hooks.sh`); FLOW_MAP rules 16-18 added, rule 8 updated.

## Files Changed
- `frontend/src/utils/planner.ts`, `components/planner/{PullForwardSheet,PlannerBits,YearTimeline}.tsx`, `pages/AdminPlannerPage.tsx`
- `frontend/src/utils/groupingEngine.ts`, `groupingRules.ts`, `components/groups/GroupEngineWizard.tsx`, `components/supports/SupportTagsModal.tsx`
- `frontend/src/pages/{AdminSupportsPage,AdminParticipantsPage,SupportProfilePage,ParticipantProfilePage}.tsx`, `components/{HubAuthorProfileModal,participantApp/ParticipantShell}.tsx`, `utils/{people,theme}.ts`, `services/{api,supabase-api}.ts`, `types/index.ts`
- `supabase/functions/push-reminders/index.ts`
- Migrations `20261006100000` pull_forward, `120000` admin support tag in jobs, `130000` support_tags, `140000` support_kind_follows_hub_roles, `150000` age_from_birth_and_participant_theme
- `.githooks/pre-push`, `scripts/{flow-map-check,setup-git-hooks}.sh`, `AGENTS.md`, `FLOW_MAP.md`

## Key Decisions & Patterns
- Strict tag matching (user chose): untagged supports never take a tag's group; leftover tagged supports are a last resort for regular groups.
- Date of birth wins over a typed age range; age 5-100 only; 18 is "18 - 24"; supports only auto-adjust once a year is added (optional).
- Tag rules and age matching are saved with the cohort's grouping rules; "leave out age range" is per build only.
- Tests that write shared settings were mocked in Playwright; test tag, test support and demo participant were restored.

## Backend / Handoff Notes
- All migrations above are applied live; `push-reminders` redeployed (01:00 UTC cron ran 200 after).
- Pushed to main as `8d77af6` (six commits after the earlier `c264902`, `7140255`).

## Pending Tasks
- Apply the Cohort 10 pull-forward on the Planner (card on `/planner`) when happy.
- Cohort 10's "Ages in a group" is "All ages mixed", so age-matching finds no older-age groups; user to decide "Similar ages" or a tag for 45 - 59 / 60+.
- Teen tag has only 2 supports for 4 teen groups; tag more supports.
- Six participants carry a placeholder 1904 birth year (left alone).
- Real deploy not checked after push; dev server still on port 5173; `.sessions/INDEX.md` and `frontend/dev-dist/` uncommitted.

## Errors Hit & Fixes
- Production deploy was blocked once by the permission system until the user approved it.
- `/groups` crashed once from a hook placed after an early return in the wizard; fixed.
- DB pooler scripts sometimes hang; use a hard timeout and a fresh connection.

## Effort Routing Suggestions

Looking at the routing decisions, I see one clear miscalibration:

• **Entry at 03:32:03.256Z** — "debug" pattern correctly matched and routed to "high" effort. This is correct; the prompt is asking you to review and analyze effort-level routing decisions, which requires reasoning and analysis.

The remaining entries show consistent patterns:
• **Entries 03:31:40–03:02:03** (task notifications, UI feedback, feature questions) all routed to "medium" with no pattern match. These are interaction/iteration prompts that don't trigger low-effort patterns like "show me" or "list", so medium is reasonable as a default for ongoing feature work.
• **Entries 03:31:39–03:31:57** (context-saver and session summary prompts) correctly routed to "low" via "show me" and "list " patterns. Appropriate.

**Suggestion:** No changes needed to effort-rules.json. The routing is well-calibrated — feature-iteration defaults to medium, explicit summaries/lists stay low, and analytical reviews (like this one) correctly escalate to high.
