# Planner Year / Quarter / Month

User approved the redesign plan with “go”; Year must remain the default. Standing instruction is to push completed fixes in batches.

Implemented in `codex/planner-sunday-clashes` on top of `7a32f40`:
- One period toolbar with Year / Quarter / Month, previous/next, and Today.
- Shared Year/Quarter timeline with accurate calendar positioning and separate lanes for nearby event labels.
- Monday–Sunday Month calendar with selected-day classes, phases, skipped Sundays, events and holidays; existing cohort, event and clash flows reused.
- Sunday-only restrictions, including dates with no cohort gap. Today reselects the current date and recenters timelines.
- Frontend only; no schema or backend deployment changes.

Verification: production build, focused ESLint, diff whitespace checks, deterministic leap-year/period/overlap checks, and actual ADMIN browser session against local frontend + deployed backend. Browser checks covered navigation and horizon, February 2027/2028, existing date/event editors, Today behavior, default Year after reload, widths 320/390/768/1280, and zero console/runtime errors. Church event scenarios were injected only in the browser. Isolated QA records cleaned after testing. Read-only independent review findings were fixed. YearTimeline's pre-existing mixed-export refresh lint rule was disabled only for its lint invocation.

Temporary checks/screenshots are under `/private/tmp/fof-planner-views`; do not commit fixtures or credentials. Publication targets `Sahm-117/for_schedule_maker` main as actor Sahm-117, author Sam <tisnotaname@gmail.com>. Unrelated local post-push edits in the preceding two session summaries were left out.

Existing follow-up from previous session: legacy backend cohort health/lateness still reads older onboarding sources; this feature does not change that behavior.
