# Supports status tabs — 2026-10-03

Changed the four Admin Supports status filters from `wrap` to the existing `scrollable` SegmentedTabs layout in `frontend/src/pages/AdminSupportsPage.tsx`. Labels keep their natural width on one row; the tray scrolls horizontally and brings the active tab into view. No shared component, filtering or backend behavior changed.

Frontend build and diff whitespace check passed. Actual admin-role Playwright against local frontend/deployed backend passed at 320, 390, 768 and 1280px: same-row tabs, no page overflow, scrolling right and back left, selected-tab updates and zero console/runtime errors. Synthetic QA admin/cohort were cleaned and zero residue verified. Temporary harness and screenshot are under `/private/tmp/fof-support-tabs`, outside the repo.

Publishing follows the user's standing instruction to push fixes in batches: actor Sahm-117, author Sam <tisnotaname@gmail.com>, destination main. Pending: record commit/deployment result after pushing. User also asked for an Apple-leaning house-style redesign approach for support cards; only a design proposal is being considered, no card redesign implemented yet.
