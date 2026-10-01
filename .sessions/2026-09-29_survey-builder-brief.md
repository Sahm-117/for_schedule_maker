# Survey builder: brief (answers received 1 Oct, mock-ups next, not built)

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

## Answers (1 Oct)
- **Builder:** admins only. **Fillers:** participants, supports and other staff; the admin picks who a survey is for (whichever people/groups/roles).
- **Scope:** each survey is set as tied to one cohort or general across all cohorts.
- **Rating scale:** set per question.
- **Anonymous:** an option set per survey in the builder.
- **Submit is final** (no editing or resubmitting).
- **Results:** CSV and PDF export, plus analysis of the responses, plus an AI summary/insights button using OpenRouter models (same route as the existing `ai-assist` function and its `ai_settings`).
- **File uploads:** under 5 MB each.
- Still to settle: open/close dates and notifications; file types; whether anonymous surveys still show who has responded ("surveyed" tab) without linking answers.
