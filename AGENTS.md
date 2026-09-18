# FOF Ops Agent Notes

This file is project-specific. Keep changes here limited to guidance for this repository.

## Product shape

- The current repo is the v1 source of truth, not the old Lovable pilot.
- The app is a weekly programme operations tool, not a generic recurring schedule builder.
- Preserve the existing role split:
  - `ADMIN` manages schedule, approvals, users, announcements, resources, and settings.
  - `SOP_PREPARER` can edit schedule through approval-aware flows.
  - `SUPPORT` is read-only and sees only support-facing routes.

## Frontend conventions

- Use the route-based shell under `frontend/src/pages/*` and `frontend/src/components/AppShell.tsx`.
- Page-level primary actions should go through `PageHeader.action`.
- Admin mobile bottom navigation should stay limited to `Dashboard`, `Schedule`, `Approvals`, and `Resources`.
- Support mobile bottom navigation should stay `Home`, `My Schedule`, `Resources`, and `Profile`.
- For admin `Users` and `Announcements`, keep the page body list/history-first and open create/send forms as overlays instead of embedding long forms inline.
- For schedule management, prefer reusing the existing `ScheduleView`, `ActivityModal`, and `CrossWeekModal` flows instead of creating parallel editing paths.
- Do not use native `<select>` controls. Reuse the portal-positioned app dropdown patterns instead.
- Render modals, slide-overs, and anchored overlays through a portal to `document.body` so table overflow and transformed ancestors cannot clip them.
- Keep page headers to one or two primary actions; put secondary utilities in `AppOverflowMenu`.

## Safe working practices

- Explore the existing flow and trace data from state/hook through rendering and action handling before proposing a fix.
- Never delete files, scripts, tables, columns, cron jobs, deployed functions, or configuration as an incidental part of a larger change. First inspect the target and its usages, check whether it is tracked, then obtain explicit per-target approval. Prefer a recoverable move where appropriate.
- Do not make backend, Supabase schema, cron, or deployment changes unless the request clearly includes them. Verify any database-facing change against the deployed environment after applying it.
- Avoid adjacent cleanup or unrelated refactors. Keep the change set limited to the requested feature or fix.

## Export behavior

- Schedule export lives in `frontend/src/utils/pdfExport.ts`.
- Supported admin export scopes are `Daily`, `Week`, and `All`.
- Support export remains personal schedule export only.

## Verification

- Frontend changes should pass `npm run build` from `frontend/`.
- For user-facing changes, also verify the affected flow in Playwright against the local frontend and the existing deployed backend. Use the role that actually uses the feature, check browser console/runtime errors, and clean up or flag any test data created.
- Be careful not to commit local inspection artifacts such as `.playwright-mcp/` unless explicitly requested.
- Before committing, run the relevant checks and `git diff --check`.

## Session and git workflow

- At the start of resumed work, read the latest relevant `.sessions/` handoff. When a feature is complete and pushed, save a new concise session summary and update `.sessions/INDEX.md` without recording credentials or unnecessary personal data.
- Before every push, show the account/PAT actor, commit author, and exact destination branch, then obtain confirmation. Use the repository-local `GITHUB_TOKEN` from `.env.github.local`, `.env.local`, or `.env` when available; never print, commit, or persist its value in a Git remote URL.
- Keep the commit author aligned with the repository's established identity. If the repository history, remote owner, and available credential point to different identities, stop and ask for direction.

## Deployment

- Production deploys from `main` via Vercel.
- Root directory is `frontend`, with `npm run build` as the production build command.
