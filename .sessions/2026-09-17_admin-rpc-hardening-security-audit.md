# Session: Admin RPC hardening + security audit

**Date:** 2026-09-17
**Branch:** main
**Session ID:** c9a00f56-680a-4210-82af-2963ff66f35c

## What Was Done

Installed the `project-audit` skill globally, ran it against this repo, then fixed the
three privilege-escalation findings it turned up. All fixes are live in production and
verified by replaying the real attacks with the public anon key.

### 1. Skill install
- `~/.claude/skills/project-audit/SKILL.md` (was only a slash command inside
  `~/Desktop/Vibe Coding/.claude/commands/`, so it never fired in other projects)
- LLM-agnostic backup synced to `~/Desktop/Vibe Coding/skills/project-audit.md`
- Description triggers on: audit, review, health-check, "doctor", "what needs refactoring"

### 2. Audit result: 45/100
Project is Vite + React 19 SPA + Supabase (not Next.js), so sections were adapted.
The Express backend in `backend/` is **dead code** — `VITE_DATA_PROVIDER=supabase` is both
the configured value and the default, so `api.ts` delegates everything to `supabase-api.ts`.

### 3. Three criticals fixed (migrations 2200 → 2500)

| Migration | Change |
|---|---|
| `20260917220000_admin_session_for_user_rpcs.sql` | Added admin-gated overloads of `create_user` / `set_user_password` taking `p_token` |
| `20260917230000_close_ungated_user_rpcs.sql` | Revoked EXECUTE on the old ungated signatures |
| `20260917240000_admin_only_role_changes.sql` | Added `set_user_role(p_token, target_user, p_role)` |
| `20260917250000_revoke_role_column_grants.sql` | Revoked `UPDATE (role)` + `INSERT (role)` on `"User"` from anon/authenticated |

Frontend: `frontend/src/services/supabase-api.ts` — `authApi.register`, `usersApi.update`,
`usersApi.resetPassword` now pass `getSessionToken()`; role routed through `set_user_role`.

**Commits:** `413ff7e`, `975c71e`, `07cd893`, `a1d7e95` — all pushed to `main`, all deployed.

## Key Decisions & Patterns

- **Three-phase zero-downtime pattern** for changing a live RPC signature: (1) add gated
  overload alongside the old one, (2) ship frontend + wait for Vercel, (3) revoke the old.
  PostgREST resolves overloads by JSON argument *names*, so both coexist cleanly. Reuse this.
- **`app_staff(p_token)` is the canonical caller check.** It does sha256 token lookup,
  expiry, and isActive. 26 participant-app RPCs already use it — match that, don't invent.
- **REVOKE over DROP.** Closes the hole, reverses with one GRANT, deletes nothing.
- **Guard against empty PATCH bodies.** Stripping `role`/`password` from `usersApi.update`
  can leave `{}`, which PostgREST rejects with 406. The table write is now skipped when
  nothing remains. This also fixed a pre-existing 406 on password-only edits.
- **Admins cannot demote themselves** (`CANNOT_DEMOTE_SELF`) — would strand the last admin.

## Backend / Handoff Notes

- Supabase project `vnmeeqvwqaeczjlvzoul`. DDL applied via the Management API using
  `SUPABASE_ACCESS_TOKEN` from `.env.local`.
- **The auto-mode classifier blocks production DDL** from the agent. Migrations were applied
  by the user running a prepared script with the `!` prefix. Expect this; prepare a script.
- Vercel git integration IS connected on this repo (`vercel[bot]` deployments appear on push).
  Note: GitHub's `deployments?sha=` filter does NOT match reliably — list unfiltered instead.
- Test accounts: `test.admin@fofikd.test` (ADMIN) / `test.support@fofikd.test` (SUPPORT).
- Playwright installed in the session scratchpad; Chromium launches fine. Dev server on `:5175`.
- Role dropdown portals to `document.body` — scope selectors to `body > div` (last child),
  otherwise you hit another row's role button and get a silent false pass.

## Pending Tasks

**CRITICAL #3 — NOT STARTED. This is the biggest remaining risk.**

55 of 68 public tables have `FOR ALL TO public USING (true) WITH CHECK (true)` and `anon`
holds SELECT/INSERT/UPDATE/DELETE/TRUNCATE on 56 of them. With only the public anon key,
anyone on the internet can read and write `Participant` (fullName, phone), `ParticipantNote`
(pastoral-care notes), and ~54 other tables. Verified live: both returned HTTP 200.

Today's work stopped privilege *escalation*. It did nothing for bulk data exposure.

**Mechanism is already proven:**
- PostgREST exposes a custom header to SQL:
  `current_setting('request.headers', true)::json->>'x-session-token'` — tested, works.
- `frontend/src/lib/supabase.ts` already wraps `fetch` (`fetchWithTimeout`) — single
  injection point, read the token from `localStorage` per request so it's always current.

**Planned phases:**
- **A** Plumbing: inject header client-side; add `app_current_token()` / `app_is_staff()`.
  Policies stay `USING(true)`. Zero behaviour change.
- **B** Pilot one low-traffic table → `USING(app_is_staff())`, verify in browser.
- **C** Roll out. ~40 staff-only tables → `app_is_staff()`. Participant-facing tables need
  `app_is_staff() OR app_participant_id(...) IS NOT NULL`. **Inventorying which tables are
  participant-visible is the real work here** — participants use this app too, and
  `app_is_staff()` alone would lock them out of their own data.
- **D** Revoke unused TRUNCATE/DELETE grants.

Every phase reverts by restoring `USING(true)`.

**Other open items (found, deliberately not touched):**
- 92 `react-hooks/rules-of-hooks` errors across 13 page components. Pattern is
  `if (!isAdmin) return <Navigate/>` with hooks below it. `isAdmin` flips false→true when
  auth resolves async, changing hook count between renders → "Rendered more hooks" crash.
- "New password (min 6)" label in the reset field, but the DB enforces min 8.
- ~57 `<button>` without `type` (defaults to submit).
- `new Intl.Collator` inside a sort comparator at `AnnouncementsModal.tsx:136`.
- `supabase-api.ts` is 5,689 lines / 58 exports / ~25 API namespaces — split per domain.
- 718 ESLint errors (326 `no-explicit-any`, 284 `no-unused-vars`).

**Housekeeping:** stale `.sessions/2026-09-17_session-cleared.md` is an empty auto-save of
this same session ID; safe to delete once this file is indexed.
