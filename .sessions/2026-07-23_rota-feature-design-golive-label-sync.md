# Session: Rota feature design and go-live label sync

**Date:** 2026-07-23
**Branch:** main
**Session ID:** 791ce796-3052-4e14-ae89-a4af489cf044

## What Was Done
Reconciled user-provided prayer-watch schedule (Weeks 3–10) against database support users and their group labels,Applied go-live label assignments: Inspirational Scriptures activities tagged with rota person's Group Support label (Wk3/8→Group 29, Wk6→Group 16),Stripped all labels from non-Inspirational activities (769 activities, 946 label links removed) to prevent unwanted notifications until feature is live,Mapped unresolved names and flagged for manual UI assignment (Kenny Abimbola, Adetutu, others without matching group labels),Created three reusable Node scripts in `/scripts/`: reconcile-golive-labels.js, assign-telegram-rota.js, backup-activity-labels.js — all reading credentials from `.env.local`, not hardcoded,Designed Rota feature UI mockup showing weekly duties × people grid, with save/apply workflow that auto-tags matching activities per week,Confirmed notification path end-to-end: Activity → ActivityLabel → UserLabel → push subscriptions

## Files Changed
scripts/reconcile-golive-labels.js — Inspirational Scriptures label sync (ran successfully),scripts/assign-telegram-rota.js — Telegram rota tagging script (parked, dry-run verified),scripts/backup-activity-labels.js — ActivityLabel backup/restore utility,scripts/_supabase.js — Shared REST client reading from .env.local,scripts/README.md — Documentation for all three scripts,.gitignore — added scripts/*.backup.json to prevent credential/data leaks

## Key Decisions & Patterns
Only Inspirational Scriptures is active now; all other activities should have labels stripped to prevent premature notifications until those duties go live,Rota feature will auto-apply labels to all matching activities for a duty × week combo, eliminating manual per-activity tagging,Scripts stored in repo with env-based credentials (no hardcoded keys) for reuse across environments and team members,Unresolved rota names (no matching support user/group) are left blank and flagged for manual UI assignment by user,Backup taken of all 987 ActivityLabel rows before destructive go-live sync; restore script available if rollback needed

## Backend / Handoff Notes
Rota feature design assumes ActivityLabel junction table for Activity ↔ Label mapping (confirmed in schema). Notification system resolves recipients via UserLabel join (confirmed in push-reminders flow). Scripts use Supabase PostgREST with service-role key; no schema changes required for Rota UI — it's purely a UX/workflow layer on existing label assignment. Consider adding audit logging when Rota applies bulk updates.

## Pending Tasks
User to confirm/assign labels for unresolved rota names via UI (Weeks 4, 5, 7, 9, 10; people: Kenny Abimbola, Adetutu Itunuolwa, Solomon Temidire, Fikayo Omowui, Mary Olalokun),Decide Telegram rota scope: create missing activities or tag existing ones only? (assign-telegram-rota.js ready to run once scope confirmed),Build Rota feature UI based on mockup: grid form, save/apply workflow, dry-run preview before label sync,Test go-live: verify Inspirational Scriptures notifications reach correct people; confirm non-active activities silent,Document Rota feature for end users (how to set weekly duty rotas and apply them)

## Errors Hit & Fixes
PostgREST `ilike` filter with wildcards was over-matching; fixed by fetching raw data and filtering locally in Node,Supabase pooler tenant lookup failed; switched to direct Postgres host, which also failed; fell back to PostgREST REST API with anon/service-role key (working path),Initial understanding missed label-based assignment layer; corrected after user clarified per-week tagging in UI screenshot,Shell quoting mangled multi-line scripts; wrote scripts to temp files instead of direct execution,Service-role key initially hardcoded; refactored all scripts to read from `.env.local` for security

## Effort Routing Suggestions

• Entry #11 ("i didnt, check again, it was a mistake") — marked medium with no pattern, but this is a simple clarification/correction request that could reasonably be low effort. Consider adding a pattern for brief correction/negation phrases if they recur.

• Entry #9 (task-notification with trace pattern) — correctly marked high with trace pattern. This is consistent and appropriate.

• Entry #12 ("[image #3]...") — marked low with "list" pattern. This appears correct for a structured lookup/listing task.

• Entry #15 ("show me the plan...") — marked low with "show me" pattern. Reasonable, though "how would that work" is a reasoning word that might warrant medium. However, the "show me" pattern override is defensible for visualization requests.

• Entries #1, #3 (token timeout requests) and #10 (credentials/secrets) — all marked medium with no pattern. Entry #10 especially is a security/sensitive data exposure that should possibly escalate to high or trigger a "credentials" pattern for consistent handling.

**Suggestion:** Add a security/credentials pattern to catch suspicious prompts like entry #10. Consider whether brief correction requests (entry #11 style) warrant a low-effort pattern. Otherwise, the routing is reasonably calibrated.
