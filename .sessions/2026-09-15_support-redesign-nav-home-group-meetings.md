# Session: FOF V2 support redesign — every support screen matched to the design

**Date:** 2026-09-15
**Branch:** main (uncommitted — nothing committed or pushed)
**Session ID:** 5f837bf3-3243-4d5c-8e2b-6a0aca8b08db

## What Was Done
Implemented the FOF V2 **support** redesign across the whole support app.
- **Design source:** `~/Downloads/FOF IKD Ops Standalone.html` (Sep 13). The repo-root `FOF IKD Ops Standalone.BACKUP.html` is the old version.
- **How it was verified:** every screen was compared against Playwright screenshots of the design on desktop (1280) and mobile (390).
- **Status:** Olamide reviewed and said "Looks good".

- **Nav (`AppShell.tsx`):**
  - Sidebar: Home, Mobilisation, My Schedule, My Group, Onboard, Hub, Resources, Profile.
  - Mobile: floating rounded bottom bar with Home / Mobilisation / Schedule / Group / More (Hub, Resources, Profile). The active item is filled with the accent colour; labels are 10px.
- **Home:**
  - Programme progress card with 4 coloured stat tiles.
  - Dark "Mark attendance" bar → My Group › Sunday class.
  - Icon quick links: Group call, Resources, My Tasks → `/support/schedule?tab=checklist`, Mobilisation.
  - Today card with working Mark done.
  - Collapsible weekly checklist (UI only).
  - Announcements aside.
- **Mobilisation (new `SupportMobilisationPage.tsx`, `/support/mobilisation`):**
  - **Register a lead:** creates a real unassigned `FollowUpContact` (email/gender/age/occupation go into notes; duplicate numbers blocked). Below it, "Leads you sent".
  - **Follow-ups:** design cards with templates, WhatsApp, Call, Edit details, and "Where do they stand?". Status uses the existing `buildStatusPatch` plus the not-interested popup.
  - Issues, Export and the registration link are in the ⋮ menu.
  - `/support/follow-ups` redirects here.
- **My Schedule (`SupportSchedulePage.tsx`):**
  - Tabs: Schedule / Checklist / Cover request, plus a week picker.
  - Today / Tomorrow / Full week filter and a green Download (PDF works).
  - Day cards with Mark done (today only).
  - Checklist and Cover request are UI only. `?tab=` is supported.
- **My Group (`SupportParticipantsPage.tsx`):**
  - Slim group line plus tabs: Participants / Group meetings / Sunday class.
  - `groups/GroupCallCard.tsx`: link = user's WhatsApp group URL; day/time via the existing slot editor.
  - `groups/ParticipantCard.tsx`:
    - **⋮ menu → View:** edit name, phone, registration details, handover notes, add note.
    - **⋮ menu → Flag concern:** sheet, UI only.
    - **Faith project sheet:** editable text, "Send to back office" (status + notify), "Send back for work". The back-office trail = review history; participant trail notes are UI only.
  - `groups/MeetingModePanel.tsx`: 5-step Attendance → Prayer → Recap → Notes → Submit.
    - Real: prayer focus, notes saved as a MEETING note on the focus participant, submit = mark done + notify, and reopen.
    - UI only: meeting attendance. Recap uses design fallback text.
  - `attendance/SundayClassPanel.tsx`: Present / Late / Absent saved on tap. `/support/attendance` redirects here.
- **Onboard:** design subtitle, segmented tabs, numbered step cards (today's data), support chips, and message cards with Copy / Send in WhatsApp.
- **Hub:** topic cards and Open/Closed tab bar restyled. Shared with admin, so admin looks the same.
- **Resources:** `ResourceHubModal` `layout="grid"`, used by the support page only.
- **Profile:** Account card (name, role, group, cohort, tags, WhatsApp link) plus Accent colour (inline swatches, Save when changed) and Alerts.
- **Shared:** new `components/SegmentedTabs.tsx`. `NeedSupportButton` moved up (`bottom-24`) to clear the floating bar.

## Files Changed
- **Modified:** `frontend/src/App.tsx`, `components/AppShell.tsx`, `components/NeedSupportButton.tsx`, `components/ResourceHubModal.tsx`, `pages/SupportHomePage.tsx`, `pages/SupportOnboardingPage.tsx`, `pages/SupportParticipantsPage.tsx`, `pages/SupportSchedulePage.tsx`, `pages/SupportResourcesPage.tsx`, `pages/SupportProfilePage.tsx`, `pages/HubPage.tsx`.
- **New:** `pages/SupportMobilisationPage.tsx`, `components/SegmentedTabs.tsx`, `components/attendance/SundayClassPanel.tsx`, `components/groups/GroupCallCard.tsx`, `components/groups/MeetingModePanel.tsx`, `components/groups/ParticipantCard.tsx` (all untracked).
- **No longer routed, NOT deleted:** `pages/SupportAttendancePage.tsx`, `pages/SupportFollowUpsPage.tsx`.
- **Plan:** `~/.claude-sam/plans/how-to-activate-voice-melodic-rivest.md`. **Memory:** `fof-v2-support-redesign-decisions.md`.

## Key Decisions & Patterns
- **Olamide:** match the design all round, even as UI only; the back office will be restyled to match later.
- **Answered decisions:**
  - Cover requests: UI only.
  - Checklist: each support edits their own (UI only).
  - Onboard a support: coordinator-only.
  - Recap: summary + prompt (UI now, admin fields later).
  - My participants: today's data in the design look.
- **Keep working behaviour:** follow-up status rules, faith project submit/notify, meeting done notify, and attendance save-on-tap.
- **Accent colour:** the app default is already the design orange. The test account is grey because its saved theme is slate. The orange-for-all vs per-user question is still open.
- **Mobile layouts:** bottom sheets and anchored menus are portalled.

## Backend / Handoff Notes
No schema changes made. Needs Olamide's OK before running:
- `AttendanceRecord.kind`
- `ParticipantFlag` table
- `Group.callPlatform` / `callLink`
- `FollowUpContact` lead columns
- `SupportChecklistItem`
- `CoverRequest`
- `Week.recapSummary` / `discussionPrompt`

The Urgent announcement card needs an urgent field + admin toggle.

## Pending Tasks
- **Commit / push** after Olamide confirms (use the push confirmation block; author `Sahm-117 <[redacted-email]>`).
- **Back office restyle** to match the design, including admin UIs for cover requests and recap summary/prompt.
- **Database step above**, then wire the UI-only pieces: meeting attendance, flags, checklist, cover requests, coaching trail.
- **Test with real rows:** the test support (Group 16) has no participants, no activities today and no assigned follow-ups. Participant cards, Sunday rows, meeting roster, Mark done and follow-up cards are unverified with data.
- **Decide:** orange for all supports vs per-user theme. Decide whether to remove the unrouted old pages (ask first).
- **Phase 2 participants** (after the auth rebuild).

## Errors Hit & Fixes
- **First pass only renamed the nav** and didn't match the design visually. Fix: screen-by-screen screenshot comparison.
- **Playwright was blocked** by the first-visit walkthrough and the notification prompt. Fix: set `localStorage.fof_walkthrough_skip_all=1` and tap "Maybe later".
- **Intermittent React warning** "state update on a component that hasn't mounted yet" on `/support`: already present before these changes.
- **Type check:** `tsc` shows 8 errors, all present before these changes. The vite build doesn't type-check.
- **Full-page screenshots** draw sticky/fixed elements mid-page; use viewport shots. Step buttons captured mid-colour-transition looked wrong; computed styles confirmed they were right.
- **Mobile fixes:** "Group call" label wrapping and Need Support overlapping the floating bar.
- **Test lead:** "ZZ Claude Test Lead" was created during verification, then deleted via REST (confirmed 0 rows).
- **Dev server** was killed twice by low memory. It is currently stopped.
