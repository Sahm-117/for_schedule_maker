# Session: Support redesign — nav, Onboard, Sunday class, Home (FOF V2 Phase 1)

**Date:** 2026-09-15
**Branch:** main (uncommitted — nothing committed or pushed)
**Session ID:** 88e70272-f84b-4db4-a43a-cd71f2ffa4cd

## What Was Done
Started implementing the FOF V2 **support** redesign in the real app (participants come later, after an auth rebuild).

- **Plan:** `~/.claude-sam/plans/how-to-activate-voice-melodic-rivest.md`.
- **Design source:** `~/Downloads/FOF IKD Ops Standalone.html` (Sep 13). The repo-root `FOF IKD Ops Standalone.BACKUP.html` is the OLD pre-redesign version.

First pass only renamed and reordered the nav. Olamide pushed back that it "does not match the design". Everything was then redone screen-by-screen against Playwright screenshots of the design.

- **Nav (`AppShell.tsx`):**
  - Support sidebar: Home, Mobilisation (→ `/support/follow-ups` for now), My Schedule, My Group, Onboard, Hub, Resources, Profile. Attendance removed.
  - Mobile: floating rounded bottom bar (support only) with Home / Mobilisation / Schedule / Group / More. The active item is filled with the accent colour. More opens a portal menu with Hub / Resources / Profile. Onboard is reachable via the hamburger drawer.
- **Onboard (`SupportOnboardingPage.tsx`):**
  - Design subtitle, plus a full-width segmented tab bar: My participants / Onboard a support. The second tab is coordinator-only.
  - My participants keeps today's data, restyled as numbered step cards with Done / In progress / Not started.
  - Onboard a support shows support name chips (first preselected), then every template as a card with Copy message + Send in WhatsApp (`buildWhatsAppLink` with the support's phone) and Download image.
- **My Group (`SupportParticipantsPage.tsx`):**
  - Segmented tabs Participants / Group meetings / Sunday class (short labels on mobile: People / Meetings / Sunday).
  - `?tab=sunday` opens the Sunday tab.
- **Sunday class:** new `components/attendance/SundayClassPanel.tsx`.
  - Contains the old attendance marking (Present / Late / Absent, saves on tap, participant notes modal) in the design layout.
  - `/support/attendance` now redirects to `/support/participants?tab=sunday`.
  - `SupportAttendancePage.tsx` is still in the repo but no longer routed. Not deleted.
- **Shared component:** new `components/SegmentedTabs.tsx`.
- **Home (`SupportHomePage.tsx`):** full restyle to the design.
  - Programme progress card with 4 coloured stat tiles.
  - Dark "Mark attendance" bar → Sunday class.
  - Icon quick links: Group call, Resources, My Tasks, Mobilisation.
  - Today card with period pill, label chip and working Mark done (reuses `supportActivityCompletionsApi`), plus "See the full week".
  - Collapsible Weekly checklist, UI only.
  - Recent announcements cream aside.
- **`NeedSupportButton.tsx`:** mobile offset `bottom-20` → `bottom-24` so it clears the floating bar. This also affects the admin mobile view.
- **Verification:** 27 Playwright checks pass (desktop 1280 + mobile 390) against the local dev server with the deployed Supabase. The build passes.

## Files Changed
- `frontend/src/components/AppShell.tsx`
- `frontend/src/App.tsx`
- `frontend/src/pages/SupportHomePage.tsx`
- `frontend/src/pages/SupportOnboardingPage.tsx`
- `frontend/src/pages/SupportParticipantsPage.tsx`
- `frontend/src/components/NeedSupportButton.tsx`
- `frontend/src/components/SegmentedTabs.tsx` (new)
- `frontend/src/components/attendance/SundayClassPanel.tsx` (new)
- Memory: `fof-v2-support-redesign-decisions.md`

## Key Decisions & Patterns
Decisions from Olamide:
- **Cover requests:** UI only for now; wire them and the admin side later.
- **Weekly checklist:** each support edits their own. The UI exists, but it is not saved yet (no DB table).
- **Meeting recap step:** summary + discussion prompt per week. Build the UI and list the admin fields needed.
- **Onboard › My participants:** keep today's data, design look.
- **Onboard a support:** stays coordinator-only.

Working rules learned:
- **Match the design visually, not just structurally.** Screenshot the design (Playwright on the Downloads HTML, "Switch role" to Support, "Mobile view" toggle) next to the app before reporting any step done.
- **Keep existing behaviour** (save-on-tap attendance, follow-up CRM, faith project flow). Deviations are flagged, not silently changed.
- **Accent colour:** the app default `--color-primary` is already the design orange `#ff914d`. The test account's grey comes from its saved theme (slate `100 116 139`), verified in the browser.

## Backend / Handoff Notes
- No backend/schema changes made.
- Planned migration (needs Olamide's OK first): `AttendanceRecord.kind`, a `ParticipantFlag` table, `Group.callPlatform`/`callLink`, `FollowUpContact` lead fields, and a `SupportChecklistItem` table.
- Later: a `CoverRequest` table plus the admin list, and `Week.recapSummary` + `Week.discussionPrompt` plus the admin fields.
- The Urgent announcement card needs an urgent field + admin toggle. Not built.

## Pending Tasks
- **Awaiting Olamide:** review of Home + bottom bar, and a decision on forcing orange for all supports vs keeping per-user theme colours.
- **Next:**
  - My Group content: Participants tab cards (group call card, ⋮ menu, flag, faith project chip) and the 5-step Group meetings Meeting Mode.
  - My Schedule tabs (Schedule / Checklist / Cover request UI).
  - Mobilisation page (Register a lead + Follow-ups).
- **Untested:** Mark done on a real activity, and the Sunday attendance rows. The test support account (Group 16) has no activities today and no participants, so a richer support login is needed.
- **Open questions:**
  - "Onboard a support" shows 35 chips with real data; a search/dropdown may be better.
  - No Save button on Sunday class (saves on tap).
  - The old status filter and count tiles were dropped from attendance.
- **Git:** commit/push only after Olamide approves, with the push confirmation block. Commit author is `Sahm-117 <[redacted-email]>`.

## Errors Hit & Fixes
- **Attached the wrong file:** the attached HTML was the old backup. The Sep 13 Downloads file is the real design.
- **Onboarding walkthrough and notification prompt covered the page in Playwright:** pre-set `localStorage.fof_walkthrough_skip_all=1` and tap "Maybe later".
- **Intermittent React warning** "state update on a component that hasn't mounted yet" on `/support`: pre-existing (also on HEAD in 2/6 runs), not caused by these changes.
- **Type check:** `tsc` reports 8 errors, all pre-existing on HEAD. `npm run build` (vite) does not type-check.
- **Full-page screenshots draw sticky/fixed elements mid-page:** use viewport screenshots to judge layout.
- **"Group call" wrapped on mobile:** fixed with `px-1` + `whitespace-nowrap`. The Need Support button overlapped the floating bar: moved up.
- **Dev server killed** once by low memory; restarted on :5173.
