# FOF on a shared church platform

Prepared 2026-10-29 for the church meeting on bringing church apps together (shared database, or systems that talk through APIs).
Visual version: https://claude.ai/artifact/BVzsVG3BwySTmQvJAQqSSp (private until shared). Editable doc: https://claude.ai/artifact/Uk2vUsRScafnZFesGgZNCr

## Short answer
- FOF can move into a church-hosted system with moderate effort, **if that system uses PostgreSQL**.
- If the church uses a different database engine, FOF's back end has to be rebuilt.
- The safest first step is to connect systems through APIs rather than merge databases.
- The word for the goal is **platform-agnostic** (also called portable or vendor-neutral): FOF runs on any PostgreSQL host, not only Supabase.

## How FOF is built today
The app (React + Vite PWA) is hosted on Vercel and deploys from `main`. The back end is Supabase, which is PostgreSQL at its core.

| Part | Count | Portability |
|---|---|---|
| Database functions (PL/pgSQL) | ~470 | Move as is to any PostgreSQL |
| Migrations | 342 | Move as is; rebuild the schema anywhere |
| Sign-in (FOF's own session tokens, stored in the database) | 1 | Moves as is |
| Edge functions (Deno) | 18 | Small rework, or self-hosted Supabase |
| Scheduled jobs (pg_cron) | 7 | Need pg_cron (or another scheduler) on the new host |
| Realtime (3 places) + storage bucket `resources` | 3 + 1 | Small rework, or self-hosted Supabase |

## Three options
| Option | What it means | Effort | Risk | Advice |
|---|---|---|---|---|
| 1. Connect through APIs | FOF stays put. Other systems use a small, documented FOF API or read-only views; FOF calls theirs. | Days per connection | Low | **Start here** |
| 2. Move to church-hosted PostgreSQL | Self-hosted Supabase, or PostgreSQL + PostgREST. FOF keeps its own schema; others get read-only views (like the existing `analytics` schema). | Days to ~2 weeks | Medium | Once the church platform is ready |
| 3. Rebuild on another engine | SQL Server, MySQL, Firebase, no-code, etc. Back end rewritten, every screen retested. | Weeks to months | High | Not advised |

Suggested path: today on Supabase → Option 1 (link by API) → Option 2 when the church platform is ready.

## If we move (Option 2): the process
Durations are rough estimates.
1. **Agree the target:** PostgreSQL version, hosting, backups, who is on call.
2. **Restore a test copy:** load the full database and run all migrations against it (1–2 days).
3. **Move the rest:** storage files, the 18 edge functions, the 7 scheduled jobs, secrets (2–4 days).
4. **Test with a copy of the app:** point a test frontend at it; walk through admin, support and participant (2–3 days).
5. **Switch over on a quiet day, never a Sunday:** keep the old system as a fallback for 1–2 weeks.
6. **Add the links:** APIs and read-only views for other church systems.

Rough total on self-hosted Supabase: a few days to a couple of weeks. Frontend hosting can stay on Vercel or move to any static host.

## Making FOF portable now
- **One adapter layer:** keep Supabase-specific code (sign-in calls, storage, realtime) behind one layer, so changing provider touches one place.
- **Background jobs as plain code:** write scheduled and background tasks so they can run on any server, not only as Supabase functions.
- **A documented, versioned FOF API:** other systems use it, never FOF's internal tables.

## Questions for the meeting
- Which database engine will the church platform use? PostgreSQL keeps the move moderate; anything else means a rebuild.
- One shared database, or separate systems connected by APIs?
- Who hosts it, how is it backed up, and how is downtime avoided on Sundays?
- How is personal data protected, especially for teenagers? Who may see phone numbers and faith project details?
- Will there be one church-wide sign-in, and when?

## Outcome
_Record the meeting's decisions here._
