# Session: Harden Supabase keep-alive

**Date:** 2026-08-29
**Branch:** main
**Published commit:** `77e701e` (`Harden Supabase keep-alive checks`)

## What Was Done

Diagnosed a reported mobile-browser and PWA network error. The public app loaded to login and the Supabase REST gateway was reachable again, consistent with a temporary database availability or wake-up event. Hardened the existing GitHub Actions Supabase keep-alive workflow and pushed the change to `main`.

## Files Changed

- `.github/workflows/keep-alive.yml`

## Key Decisions & Patterns

- Run the authenticated Supabase REST keep-alive every six hours instead of once per day.
- Retry transient network failures and cap connection/request time.
- Treat only HTTP 2xx as a successful keep-alive. A 401/403 now fails the workflow instead of falsely reporting that the database is protected from pausing.
- Preserve unrelated Rota work: the remote advanced to the Rota commit independently, so the keep-alive commit was rebased and pushed as the only new change.

## Backend / Handoff Notes

- Supabase was reachable after recovery; the unauthenticated diagnostic endpoint returned its expected `401` response.
- The keep-alive workflow still uses the repository's existing authenticated REST configuration. Do not record credential values in session files or commit messages.
- Vercel deploys from `main`; monitor the next scheduled Actions run to confirm the hardened check receives a 2xx response.

## Pending Tasks

- Confirm a scheduled **Keep Supabase Alive** GitHub Actions run succeeds after the new workflow is live.
- Consider adding an independent external uptime check if database availability is mission-critical; one scheduler alone remains a single point of failure.

## Errors Hit & Fixes

- GitHub API lookups from the workspace intermittently failed DNS resolution, so the PAT owner could not be programmatically queried; the user confirmed it before push.
- The first targeted push lacked an exported token; the retry authenticated correctly but was non-fast-forward because remote `main` had advanced. Fetching, rebasing the one workflow commit, and retrying published `77e701e` safely.
