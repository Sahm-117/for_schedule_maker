# Remote review and Sunday-only planner markers — 4 Oct 2026

## What Was Done
Fetched origin/main aada83d and reviewed the six support-card commits after df6db86 (9cfeb5b, dda22b9, 24eda7a, 86d2c63, 9095860, aada83d). Visual changes and existing card actions were retained. Corrected three findings: the new onboarding bar read retired ParticipantOnboardingStatus data; failed/pending activity requests falsely displayed Never active; each refresh issued single-user activity RPCs for every historical support. Bar now uses current cohortOnboardingProgress, intersects ACTIVE non-test cohort_people members and honors sticky completed state. Unknown activity is distinct from a successful null response. Activity reads are scoped to cohort/displayed group supports, cached two minutes, deduplicated in flight and limited by a shared four-request queue across refresh generations.

Planner clash detection already checked individual class dates. Corrected presentation: Stops-FOF event ranges are shaded only on covered Sundays; skipped-class gaps show narrow Sunday markers, exact-date tooltips and Sunday class wording rather than whole paused weeks. A wider transparent hit area keeps narrow timeline markers usable. Event dates, class date adjustments, preview/apply APIs and phases were preserved.

## Files Changed
frontend/src/pages/{AdminSupportsPage,AdminPlannerPage}.tsx; frontend/src/utils/{people,planner}.ts; frontend/src/components/planner/{YearTimeline,CohortCard,PlannerBits}.tsx; session notes/index.

## Key Decisions & Patterns
No backend, schema, cron, deployment configuration or production schedule changes. Reused current onboarding RPC and existing roles/actions. Managed attached worktree /Users/olamide/.codex/worktrees/finish-app-nudge/fof_schedule, branch codex/planner-sunday-clashes. Original checkout has pre-existing untracked frontend/dev-dist; previous local Compact post-push note in worktree remains unstaged.

## Verification
Production build and whitespace checks passed. Changed files lint clean except YearTimeline's existing react-refresh mixed helper/component export rule: verified identical failure on origin/main, then linted changed file with that one rule disabled. Deterministic helper checks cover weekday-only events, inclusive Sunday endpoints, overlapping-event deduplication, year clipping, actual class clash rules, skipped Sundays and unknown/null activity.

Actual ADMIN-role Playwright on local frontend with deployed backend verified current completed participant + excluded incomplete test participant, restricted activity IDs, retained Details, support cards at 320/390/768/1280px, exact skipped-Sunday tooltip and summary, narrow week marker, Sunday-only year shading, weekday-only event exclusion, planner at 320/390/1280px, and activity failure/null distinction. Normal flows had zero console/runtime errors; intentional activity 500 response was checked separately. Church events in these scenarios were browser-injected fixtures, never saved; real cohorts/events/class dates were not changed. Exclusive synthetic user/cohort/group/hub/participant/onboarding/session fixtures were cleaned; all residue counts zero. Test harnesses live under /private/tmp/fof-planner-review; never commit fixture.json or credentials. Fresh independent read-only review found no blocking regressions after fixing cross-refresh activity deduplication.

## Backend / Handoff Notes
Pre-existing issue remains: cohort_people still derives onboarding completion/timing from retired support-ticked status tables. Thus the health/lateness badge can disagree with the now-correct participant-led progress bar. Fix requires a separately scoped backend change and deployed verification; none applied in this request. No batch last-activity endpoint exists, hence scoped frontend request queue.

## Pending Tasks
Pushed 7a32f40 to main under the user's standing batch-push instruction; actor Sahm-117, author Sam <tisnotaname@gmail.com>, destination Sahm-117/for_schedule_maker main. Frontend Vercel deployment succeeded; production AdminPlannerPage and AdminSupportsPage bundles verified to serve new Sunday marker copy and current cohortOnboardingProgress reads. No requested frontend work remains. Legacy health timing backend follow-up remains as described above. This post-push note is saved locally.

## Errors Hit & Fixes
Independent review caught activity responses racing across canceled effect generations and excluded inactive group leaders; shared in-flight queue and rendered-leader inclusion corrected both. Timeline marker was initially too thin to tap; transparent hit area fixed this while keeping Sunday-only color.
