---
name: ContextCatchup
description: Catch up on prior work by reading the .sessions/ history that ContextSaver wrote. Reads INDEX.md, digests the most recent session first, then offers to digest older entries. Use at the start of a session to restore context.
metadata:
  short-description: Read .sessions/ history and catch up on prior work
---

# ContextCatchup

The read-side counterpart to **ContextSaver**. ContextSaver *writes* per-session summaries into `.sessions/`; ContextCatchup *reads* them back so you can resume exactly where a previous session (Claude Code, Codex, Cursor, Aider, GPT, Gemini, etc.) left off.

**Scope:** ContextCatchup only consumes the `.sessions/` history. It does not write, summarise, or modify session files — that is ContextSaver's job. It does not generate handoff docs or PR descriptions.

## What it reads

- `.sessions/INDEX.md` — the appendable table indexing every session (newest rows at the bottom)
- `.sessions/YYYY-MM-DD_<slug>.md` — the individual session files referenced by the index

## How to invoke

This is a read-and-reason skill, not a script. Follow these steps:

### 1. Read the index first

Read `.sessions/INDEX.md`. It is a Markdown table:

```
| Date | Summary | Branch | Files Changed |
```

Rows are appended chronologically, so the **last row is the most recent session**. If the file is missing, tell the user there is no session history yet and stop.

### 2. Identify the latest entry

Take the bottom-most row of the table. Map its date + summary to the matching file in `.sessions/`. Filenames follow `YYYY-MM-DD_<slug>.md`. If multiple files share a date, match on the slug words that overlap the summary. Skip "session cleared / no work" entries when picking what to digest — they carry no substantive context, but mention they exist.

### 3. Digest the latest session

Read the matched session file in full and digest it. Each file has these sections:

- **What Was Done** — the work completed
- **Files Changed** — paths touched (with notes)
- **Key Decisions & Patterns** — the *why* behind choices; the most important section for continuity
- **Backend / Handoff Notes** — anything needing another person or follow-up
- **Pending Tasks** — unfinished work the next session should pick up
- **Errors Hit & Fixes** — gotchas already encountered

Present back to the user a tight digest (token-efficient — no padding):
- One-line summary of what that session accomplished
- Pending tasks (most actionable — lead with these)
- Any backend/handoff notes or open decisions

### 4. Ask before going further back

After digesting the latest, ask the user whether to digest anything else — for example:

> Caught up on the latest session (`<filename>`). Want me to digest any earlier sessions? I can pull the previous N, a specific date, or stop here.

Only read older files if the user confirms. Do not bulk-read the whole history unprompted — it wastes context.

## Output style

- Lead with pending/actionable items, not a chronological recap
- Keep the digest scannable: short bullets, real file paths (clickable)
- Never re-summarise sections that are empty or marked "None"
- Honour the user's working rules (token efficiency, no padding)

## Relationship to ContextSaver

| | ContextSaver | ContextCatchup |
|---|---|---|
| Direction | Writes `.sessions/` | Reads `.sessions/` |
| When | End of session / before compaction | Start of session / when resuming |
| Trigger | Global hook + manual | Manual (run when you need context) |
