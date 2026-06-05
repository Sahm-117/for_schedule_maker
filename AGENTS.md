# FOF IKD Ops Agent Notes

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

## Export behavior

- Schedule export lives in `frontend/src/utils/pdfExport.ts`.
- Supported admin export scopes are `Daily`, `Week`, and `All`.
- Support export remains personal schedule export only.

## Verification

- Frontend changes should pass `npm run build` from `frontend/`.
- Be careful not to commit local inspection artifacts such as `.playwright-mcp/` unless explicitly requested.

## Deployment

- Production deploys from `main` via Vercel.
- Root directory is `frontend`, with `npm run build` as the production build command.
