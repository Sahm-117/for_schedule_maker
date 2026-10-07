---
name: ContextSaver
description: Save the current Claude Code session to .sessions/ before context compacts or when wrapping up a feature. Writes a Markdown summary that any LLM can read in future sessions.
metadata:
  short-description: Save session context to .sessions/
---

# ContextSaver

Saves the current session as a Markdown summary in `.sessions/` so future Claude Code sessions — or any LLM (Codex, Cursor, Aider, GPT, Gemini) — can pick up exactly where this one left off.

**Scope:** ContextSaver only persists per-session history. It does NOT generate handoff docs, PR descriptions, or release notes — those are separate concerns owned by other skills.

## What it produces

- `.sessions/YYYY-MM-DD_<slug>.md` — one file per session with the structured summary
- `.sessions/INDEX.md` — an appendable table indexing every session

## What it captures

The summariser samples the **start and end** of the session (first ~40 + last ~60 messages, with a
`[middle of session omitted]` marker between), not just the first N. This guarantees the summary
reflects **where the session ended up** — the final outcome (work completed, pushed, renamed late in a
long session) — not only where it began. When start and end disagree, the end is treated as the final
state. Short sessions are captured whole.

## How to invoke

Automatic (fires on its own as `SessionStart` / `PreCompact`):

```bash
node "$CLAUDE_PROJECT_DIR/.claude/hooks/session-start.js"
```

Manual (force-save the current/most-recent session mid-chat — use this when invoked by hand):

```bash
node "$CLAUDE_PROJECT_DIR/.claude/hooks/session-start.js" --manual
```

The hook is registered globally as both `SessionStart` and `PreCompact`, so it fires automatically. The transcript dir is resolved from `CLAUDE_CONFIG_DIR` (falling back to `~/.claude`), and the right transcript is found by matching the recorded `cwd` to the current project — not by reconstructing a dir name — so sessions launched from a parent workspace dir are still saved automatically. **When you run it by hand, pass `--manual` (or `--now`)**: this keeps the same project-scoped `cwd` match but adds a last-resort fallback to the globally-newest transcript (with a warning) if nothing matches by `cwd`, so a hand-run always saves something. (It still skips if that transcript is already summarised or empty.)

## After running

Report back what the script printed:
- `Session saved: .sessions/<filename>` → confirm the filename and a one-line summary of what was captured
- `Session already summarised` → tell the user this session is already in the index
- `No previous session found` → there's nothing to save yet (first session in this project)
- `Failed to run claude CLI` → the `claude` binary isn't on PATH, or isn't authenticated — tell the user to run `claude` interactively once to confirm it works, or set `CLAUDE_BIN` to its full path
- Any other error → surface it and diagnose

## How other LLMs use the output

At the start of a new session in any agent, paste:

> Read `.sessions/INDEX.md` first, then the most recent session file relevant to what I'm about to ask. Use that context to inform your work.

The files are plain Markdown — greppable, no special tooling.

## First-time per-project setup

In this repository ContextSaver runs from the project hook (`.claude/hooks/session-start.js`, registered in `.claude/settings.json` for `SessionStart` and `PreCompact`). The per-project requirement is:

Add to `.gitignore`:
```
.sessions/
```

## Authentication

Summarisation runs through the `claude` CLI itself (`claude -p --output-format text`, piped via stdin), reusing whatever session already authenticates Claude Code — no separate `ANTHROPIC_API_KEY` or SDK install required. This also sidesteps org-account API billing issues, since it rides on the interactive login instead of a metered API key.

The CLI binary is resolved via `command -v claude`, or override with the `CLAUDE_BIN` env var if it's not on PATH.

**Porting to a non-Claude-Code LLM agent:** if you're recreating this skill for Codex/Cursor/Aider/etc., replace `runClaudePrompt()` with whatever non-interactive "print mode" or one-shot completion command that agent's CLI exposes under its own authenticated session (e.g. an equivalent `--print`/`-p` flag), passing the same prompt via stdin or an argument, and parsing its stdout the same way.
