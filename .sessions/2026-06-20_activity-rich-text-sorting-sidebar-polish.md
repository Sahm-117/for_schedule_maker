# 2026-06-20 — Activity Rich Text, Sorting, Sidebar Polish

## What Was Done

- Finished the activity description rich-text work using a lightweight Markdown subset stored in `activity.description` as a plain string.
- Added a reusable activity label picker that replaced the modal checkbox grid with an app-style searchable multi-select dropdown.
- Improved activity description list formatting so selected prose can become clean bullet or numbered lists, including smart comma/semicolon splitting outside brackets/parentheses.
- Extended formatted activity descriptions across schedule cards, dashboards, previews, and PDF export while preserving WhatsApp/Telegram icon rendering.
- Applied natural ascending ordering across user-facing listings and dropdowns for participants, groups, users/supports, labels, cohorts, resources, faith projects, onboarding templates, follow-up contacts, and owner pickers.
- Removed the top-bar Resources shortcut and grouped admin sidebar navigation.
- Final sidebar polish was pushed to `main` in commit `83c7789`:
  - `Faith projects` and `Group prayers` moved under `People & groups`.
  - `Care & engagement` renamed to `Engagement`.
  - Admin sidebar section headers are collapsible and open by default.
  - Global font changed from Plus Jakarta Sans to the Apple/system UI stack.
  - Support onboarding status saves now show a spinner inside only the clicked checkbox.

## Files Changed

- Rich text and activity rendering:
  - `frontend/src/components/ActivityDescriptionToolbar.tsx`
  - `frontend/src/utils/activityDescription.ts`
  - `frontend/src/components/ActivityText.tsx`
  - `frontend/src/utils/pdfExport.ts`
  - `frontend/src/components/ActivityModal.tsx`
  - `frontend/src/components/CrossWeekModal.tsx`
- Activity labels and schedule flows:
  - `frontend/src/components/ActivityLabelPicker.tsx`
  - `frontend/src/pages/AdminSchedulePage.tsx`
  - `frontend/src/components/DaySchedule.tsx`
  - `frontend/src/components/PendingChangesPanel.tsx`
- Sorting:
  - `frontend/src/utils/sort.ts`
  - Admin/support listing pages under `frontend/src/pages/*`
  - follow-up shared components under `frontend/src/components/followups/*`
- Sidebar, typography, onboarding polish:
  - `frontend/src/components/AppShell.tsx`
  - `frontend/src/index.css`
  - `frontend/src/pages/SupportOnboardingPage.tsx`

## Key Decisions & Patterns

- Kept `activity.description` as `string`; no API, database, or dependency change for rich text.
- Supported Markdown subset is intentionally limited to bold, italic, bullet lists, and numbered lists.
- Centralized description parsing/formatting so React rendering, plain-text fallbacks, and PDF output interpret descriptions consistently.
- Used a shared natural text sorter with numeric collation for alphabetical/numeric list ordering.
- Preserved intentional non-alphabetic order where it matters: schedules and activities remain chronological/manual; week lists remain numeric; announcement/event/history feeds remain newest-first.
- Admin sidebar collapse state is local UI state, defaults open, and applies to desktop and the mobile drawer.
- Onboarding checkbox save state is tracked by `participantId:statusKey`, allowing multiple row-level saves without dimming or blocking the whole card.

## Backend / Handoff Notes

- No new Supabase migration was introduced for the rich text, sidebar, sorting, typography, or onboarding spinner work.
- Existing create/edit/request APIs continue sending activity descriptions and label IDs/names unchanged.
- Schedule publish gate work exists in recent history and included a migration, but it was not part of the final sidebar polish commit.
- Remote contains a tokenized GitHub URL in local git config output; do not copy secrets into docs or chat. No raw token values are included here.

## Pending Tasks

- Manual visual QA is still useful on a real device:
  - Admin desktop and mobile drawer sidebar collapse behavior.
  - Support onboarding checkbox spinner behavior under slow network.
  - PDF export wrapping for long formatted descriptions.
  - Rich text label picker interaction in both normal activity and cross-week activity modals.
- `.playwright-mcp/` artifacts exist in repo history/local context from prior inspection sessions; avoid adding new inspection artifacts unless explicitly requested.

## Errors Hit & Fixes

- Earlier partial rich text/list behavior only prefixed selected text as one block; fixed by smarter line/item splitting and marker normalization.
- Activity label selection previously used a large embedded checkbox grid; replaced with a reusable dropdown picker.
- A full participant status block looked disabled/washed out during onboarding status updates; fixed with per-checkbox spinner state.
- All relevant frontend builds passed with `npm run build` from `frontend/`, including the final pushed sidebar/onboarding polish.
