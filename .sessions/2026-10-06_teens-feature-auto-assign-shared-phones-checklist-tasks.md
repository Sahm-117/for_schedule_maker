# Session: Teens feature, shared phones, checklist tasks (whole-day summary)

**Date:** 2026-10-06
**Branch:** main
**Session ID:** 2377d56e-701d-4af1-9b3e-ffa52bca3159

Detailed notes (hand-written, accurate): `2026-10-06_teens-step-1-tag-statuses.md`, `2026-10-06_teens-step-2-review-handover.md`, `2026-10-06_admin-checklist-tasks.md`. Use those first; this file is the one-screen summary.

## What Was Done
- **Teens steps 1 and 2 (built, live, teen switch OFF):** built-in Teen Support tag, TEENAGER / TEEN_ONBOARDED statuses, form "Below 18" auto-tag, same-gender-only assignment (hard rule) with a limit per Teen Support (4), Mobilisation "This person is a teen" switch, teen cards with parent number first, Onboarded with a reason, teen welcome template with the support's group link, "Copy my teens for WhatsApp", Settings card (switch and limit), teens may share a phone number, sibling rule (a different name on a shared phone is a new person), Abimbola Oluwaseye restored.
- **Passed-on follow-ups:** card says "passed on from <name> <date>"; alert says it was passed on.
- **Admin checklist tasks for supports:** Schedule `⋮` > Add task for supports (due day, weeks, everyone/tag/people), supports tick with an optional note and can't delete, Home shows 3 + View all.
- **Two code reviews** (11 + 9 findings) fixed. One-page visual PDF of the teen flow saved to `~/Downloads/Teens-in-FOF-how-it-works.pdf`.

## Files Changed
Migrations `20261006160000` to `20261006210000`; edge functions `receive-form-registration` (v13), `run-followup-assignment` (v8); frontend follow-up, Mobilisation, Settings, Schedule, Support Home pages and components; `FLOW_MAP.md` rules 19-21.

## Key Decisions & Patterns
- `teen_flow_enabled` stays false until teen groups and Sunday attendance exist.
- Teens go only to a same-gender Teen Support; if none has room they wait and admins are told.
- "From admin" checklist task = `taskGroupId` set; the guard trigger is SECURITY INVOKER.

## Backend / Handoff Notes
- Everything above is applied live and pushed to main (last commit `5d9fee9` plus session notes). Edge deploys are blocked for Claude by the safety classifier; the user runs them with `!`.

## Pending Tasks
- Teens step 3: teen groups (one per Teen Support, filled first, no meeting/recap) and Sunday attendance (teens only, switch back to the general list).
- Teens step 4: Teen dashboard card and badges, move the 12 existing teens (switch off any logins, do not delete), admin "Not a teen" and manual reassignment limited to Teen Supports, Abimbola Oluwaseye needs a follow-up record, Titilope to be registered by a support with the Teen switch, optional policy acceptance gate.
- Then turn `teen_flow_enabled` on.
- Checklist tasks: push reminders, editing a task, alerting admins on notes (not built).
- Unused column `FollowUpContact.teenGenderFallback` left in place; church email is in two places (commented).

## Errors Hit & Fixes
- Several commands were blocked by the safety classifier (writes, a localhost check, deploys, one DB change) and were cleared by the user.

## Effort Routing Suggestions

Looking at these routing decisions, I see one clear pattern mismatch:

• **"push" prompts routed as medium** — entries at 12:09:59 and 13:23:56 ("push whatever you can push as well", "push what you have, and context save") are getting medium effort when they should be low. These are simple git operations, not reasoning tasks. Add pattern: `"push"` → `low` to effort-rules.json.

• **Task notifications correctly low** — the `<task-notification>` entries properly match the "list " pattern and route to low. No change needed there.

• **"where is" lookup correctly low** — entry at 10:04:13 matches the lookup pattern; this is right.

• **Summarization prompts correctly high** — the three entries at 13:24:31-36 matching "what's wrong" are appropriate for high effort (multi-file context summaries), though the pattern name is misleading. Consider renaming that pattern to something broader like `"summary|summaris"` to catch more synthesis tasks.

Otherwise routing looks sound. Suggest adding the "push" pattern to trim unnecessary medium-effort rounds.
