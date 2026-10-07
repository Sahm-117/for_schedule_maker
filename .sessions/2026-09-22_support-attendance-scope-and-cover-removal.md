# Support attendance scope and cover removal

## What Was Done

- Clarified attendance ownership: supports continue marking attendance inside their own Group Meeting flow; they do not take Sunday attendance for their group. The shared cohort-wide `/attendance` module remains available to authorised supports and admin.
- Removed the old Cover Requests experience from support schedule, support group workspaces, admin Supports, dashboard operations/attention surfaces, approvals copy, and product tours.
- Updated support health evaluation to judge group-meeting report submission plus group-meeting attendance, without a per-support Sunday requirement.
- Fixed the admin Users action menu by rendering it through a portal with a fixed elevated layer, preventing mobile card/page clipping.
- Preserved legacy cover API/data/component code as unused compatibility code; no records or backend tables were deleted.

## Files Changed

- Support/admin UI: `frontend/src/pages/SupportSchedulePage.tsx`, `SupportParticipantsPage.tsx`, `AdminSupportsPage.tsx`, `AdminDashboardPage.tsx`, `AdminApprovalsPage.tsx`.
- Rules and navigation copy: `frontend/src/utils/programmeRules.ts`, `frontend/src/components/dashboard/healthModel.ts`, `frontend/src/constants/tours.ts`, `frontend/src/components/ScrollToTop.tsx`.
- Admin Users overlay: `frontend/src/components/UserManagement.tsx`.
- The pushed commit also contains the previously completed shared attendance, notification, dashboard, logo, chevron, checklist, and mobile polish work plus four attendance migrations.

## Key Decisions & Patterns

- Keep shared Sunday attendance separate from support-owned group-meeting attendance.
- Keep group-meeting attendance and report submission in Meeting Mode.
- Use body portals for anchored menus/modals so transformed or overflow-hidden cards cannot clip them.
- Remove user-facing routes and copy, not legacy storage/API definitions, unless explicit deletion is requested.

## Backend / Handoff Notes

- Commit `d06bedb` was pushed to `origin/main` as `Sahm-117 <[redacted-email]>`.
- The four attendance migrations are included in that commit.
- The repository-local GitHub token was used ephemerally; no credential was written to the remote URL or this summary.

## Pending Tasks

- User should test the support Group Meeting attendance/report flow, shared `/attendance`, and the admin Users menu on a phone-sized viewport.
- Legacy cover records/API/component remain available but are no longer reachable from active UI.
- Existing seeded checklist rows were intentionally not bulk-deleted because that could remove manually-created items with matching labels; delete only with explicit target approval.
- Local inspection artifacts remain untracked: `.playwright-cli/`, `output/`, `prototypes/`, and the standalone HTML file.

## Errors Hit & Fixes

- Initial push used a cached `Prod-Sam103` credential and returned 403. The verified `Sahm-117` repository-local token was then supplied through an ephemeral Authorization header; push succeeded.
- The first portal implementation rendered the menu twice because mobile and desktop branches both mounted it. It was corrected to render one menu portal outside the mapped branches.
- `npm run build` and `git diff --check` passed after the final changes.
