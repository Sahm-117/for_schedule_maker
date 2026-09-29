# Survey builder: brief (on hold, not started)

Captured 2026-09-29 from the user. Parked because something else came up. Nothing has been built or designed yet.

## What the user asked for
- A **Survey** module in the app.
- A tab/list showing surveys and who has been surveyed ("surveyed etc").
- Open a survey to **see its results** or **edit** it.
- Field types:
  - Text (single line)
  - Text area (multi-line)
  - Number
  - Rating, with labels for both ends of the scale (e.g. "Poor" … "Excellent")
  - Image/file upload

## Open questions to ask when we resume
- Who fills surveys in: participants (participant app), supports, or both? Who builds them: admins only?
- Per cohort, or across cohorts?
- Rating scale: fixed 1–5, or set per question (e.g. 1–10)?
- Required vs optional questions; question order/reordering; sections?
- One response per person, or can they edit/resubmit? Anonymous option?
- Results view: per-question summaries (averages for rating/number, list for text, gallery for uploads) plus per-person responses? Export (CSV/PDF)?
- Notifications when a survey opens or closes; open/close dates?
- File upload limits (types, size) and where files live (existing Supabase storage buckets?).

## Working-style reminders
- Share understanding first, with mock-ups as rendered screenshots plus an explainer. Build only on an explicit go.
- Follow AGENTS.md: route-based pages, PageHeader.action, app dropdowns (no native select), portals for overlays, list-first pages with create/edit in overlays.
