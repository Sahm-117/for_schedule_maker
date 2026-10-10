# Session: Session summary format request

**Date:** 2026-10-10
**Branch:** main
**Session ID:** ef61a46e-5e1b-4c04-a840-21239941ee68

## What Was Done
Received session summary JSON schema with 9 required fields,Clarified output format: JSON only, no markdown

## Files Changed
None

## Key Decisions & Patterns
Use END state of session as source of truth when start/end conflict,Keep title max 10 words; slug max 80 chars; summary max 120 chars,Use semicolon-separated phrases for keyChanges (each phrase max 6 words)

## Backend / Handoff Notes
None

## Pending Tasks
None

## Errors Hit & Fixes
None

## Effort Routing Suggestions

Looking at the entries, I see a clear pattern:

- **3 entries routed to "high" via "debug" pattern** (timestamps 13:01:56, 13:02:06, 13:02:20) — these are prompts asking you to *review and analyze* effort-routing decisions, not to debug user code. The word "debug" in "you are reviewing effort-level routing decisions" and "you are reviewing" is a false positive.

- **1 entry routed to "high" via "debug" pattern** (13:02:07) — same issue; prompt is "you are summarising a claude code session" with "debug" in the effort-rules context, not the actual task.

- All other "list " → "low" entries are correctly routed for session summarization tasks.

**Suggestion:** Tighten the "debug" pattern to require it in a context where you're actually debugging *code* or *systems*, not meta-tasks. Either:
1. Change the pattern from `"debug"` to require more specificity like `"debug code"` or `"trace"`, or
2. Add a negative lookahead to exclude prompts containing "reviewing effort" or "summarising".

The current "debug" pattern is too broad and fires on introspection tasks that should stay low-effort.
