# Agent handoffs

This folder is how one working session hands over to the next, whether the next reader is a
person or another agent. It is tracked in git on purpose (unlike `.sessions/`, which is
git-ignored and only exists on one machine).

## Rules for every agent

1. **Read before you work.** Open `INDEX.md`, then the newest handoff that touches what you are
   about to change. Check "Open items" and "Gotchas" in it. Do this even for a small request.
2. **Write before you stop.** When you finish a feature, or a stretch of work that changed the
   live database, an edge function or user-visible behaviour, add a handoff and an `INDEX.md`
   row in the same change. A session that only chats needs none.
3. **Say what is live.** List every migration you applied to the live database and every edge
   function you deployed (with its version), because the repo alone does not show that.
4. **No secrets, no personal data.** Never record keys, tokens, passwords, phone numbers or
   people's names. Say "two registered contacts", not who they are. Use ids only when needed.
5. **Keep it short and true.** Facts, decisions and next steps. Mark anything you did not verify.
6. **Never rewrite an old handoff** except to fix a mistake; add a new one instead.

## File naming

`YYYY-MM-DD_short-topic.md`, one per stretch of work. Add a row to `INDEX.md` (newest first).

## Layout of a handoff

Summary · Shipped (commits) · Live changes (database, edge functions) · Decisions and why ·
How it was tested · Open items · Gotchas · How to pick this up.

`.sessions/` holds older, auto-written summaries. They are still worth a look for history, but
new handoffs go here.
