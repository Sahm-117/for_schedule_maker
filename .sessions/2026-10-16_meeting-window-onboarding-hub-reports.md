# 2026-10-16 · Meeting window, onboarding steps, hub reports, intro tick

Continuation of the 2026-10-15 session (same conversation). Handoff: `docs/handoffs/2026-10-18_meetings-window-onboarding-hub-reports.md`. FLOW_MAP rules 35, 53, 57 updated; 75–79 added.

## Shipped (pushed to main, `6679a0a..affa6b1`)
- `146ff98` Session notes (previous stretch).
- `db29022` Meeting window, onboarding steps at the top, hub reports.
- `affa6b1` After the first class: keep "Introduce yourself", let participants tick it.

## Live database (all applied and checked)
- `20261018100000_support_onboarding_override.sql`: `SupportOnboardingOverride`, `admin_set_support_onboarding_override`, `onboarding_progress_json` returns `overrides`.
- `20261018120000_participant_intro_tick.sql`: `ParticipantOnboarding.introTickedAt`, `participant_tick_intro(token)` (refused until the support has posted an intro), `participant_onboarding_state` returns `introTicked`.
- `20261018110000_meeting_recording_window.sql`: applied after the Vercel deploy was live. `fof_meeting_window`, `fof_assert_meeting_open` and `meeting_window_guard` triggers on MeetingAttendance, GroupPrayerStatus, SupportSession (SUNDAY_RECAP) and SupportSessionAttendance.
- Data clean-up (owner approved, only records before 11 Oct): one group meeting row, 13 hub marks from 1 Oct, two empty hub sessions, and one hub's early "prayer finished" time. Backup in the scratchpad (`backup-early/`, not in the repo).

## What the owner decided
- Recording opens 10 minutes before the set time and closes at midnight Lagos time; admins any time. No time set means no recording. Practice cohorts are exempt.
- Meeting lengths are removed everywhere. Saving a time clears the old length; the columns are kept.
- Teen groups set a day and time like adult groups (teen card, `groupsApi.setMeetingSlot`, which creates no schedule tag).
- After attending (Present, Late or Left early), the map, the guide and "ready for class" are cleared. "Introduce yourself" stays until posted, and the participant can tick it once their support has introduced. "Finish your profile" stays until complete.
- Staff readiness means completed, or attended with intro and profile done. This feeds the support "x of y ready", the Groups chip, the Supports page and the dashboard warning.
- The support's "Get your group ready" steps sit at the top of My Group and Home. The app ticks them; only an admin can tick one by hand (Groups → card menu → Support steps).
- Hub meeting reports go on the admin Hubs page and the dashboard line. The dashboard tiles show "This week so far".

## Findings this stretch
- Godswill's Hub 3 meeting was recorded. I first said otherwise because I checked the wrong table; hub meetings live in SupportSession, not AttendanceSession. He submitted the report later that night.
- Of 82 participants, 39 were present in Week 1. Only one adult group had genuinely recorded a meeting. 37 attendees had not introduced themselves.
- On 16 Oct, 10 adult groups and all 5 teen groups had no meeting time.

## Open
- A support can bypass the window by moving the meeting time to "now". Locking slot changes after the week's meeting time has passed was offered, not decided.
- No Week exists for 18–24 Oct, so a meeting held that week has no week to be recorded against.
- Staff per-person step pills still show the raw five steps.
- Dropping the `meetingDurationMins` columns needs separate approval.
- The Stop hook keeps asking to re-author commits as Claude. This was declined each time; commits stay Sam's.

## Later in the same session (17 Oct): admin redesign, clean-up, meeting-length drop

Pushed to `origin main` (up to `09f37ec`); Vercel deploys from it. Handoff: `docs/handoffs/2026-10-18_meetings-window-onboarding-hub-reports.md` (batch notes). FLOW_MAP rules 78 and 80 updated.

### Shipped
- **Shared page top:** section tabs under the page title (`SectionTabsContext`, `PageHeader`), Groups > Meetings tab (admin only), header extras moved into the ⋮ menu (Follow-ups, Faith projects, Planner keeps Add event), Allocation titled "Allocation".
- **Groups:** calmer `GroupCard` (one status word, one bar, setup chips only when missing) with a detail sheet; each person shows step chips, not-signed-in, phone and "Seen <date>" (existing `participants_app_details()`; active cohorts only).
- **Group meetings:** reports card with week chips, empty state ("No meetings recorded for Week N yet", see the groups with no time).
- **Dashboard** "right now" lines in one card; **Attendance** summary in one card; **Hubs** reports card starts closed and the Last recap strip is gone; **Users/Cohorts/Onboarding/Approvals/Notifications/Scriptures** tidied; **Supports** cards simplified; **participant profile** Onboarding+Journey merged into a Progress card.
- **Bug fixed:** Onboarding page, support onboarding page and group overview counted "ready" by the `completed` flag only (so a group of fully ticked people said "0 of 3"). One rule now: `participantFinished` in `utils/supportOnboarding.ts`.
- **Clean-up (approved):** deleted `GroupOnboardingStrip.tsx`, `AttendanceSummaryStrip.tsx`, `MetricCard`, the unused cover-request API, unused variables/imports. Compiler errors 24 → 7 (all in `AdminWebsitePage.tsx` / `PracticeDock.tsx`, left alone on purpose).

### Database: meeting lengths (approved by the owner) — NOT APPLIED YET
- Migration `supabase/migrations/20261019100000_drop_meeting_duration.sql` rewrites 10 functions and drops `meetingDurationMins` from Group, SupportHub, HubLeadsMeeting. Tested on live data inside a rolled-back transaction (read RPCs, both hub save RPCs, `practice_prepare`).
- Apply it only AFTER the new app is live; an older open tab still writes the Group column and will fail to save a group's meeting time until reloaded. The two hub RPCs keep an ignored `p_meeting_duration_mins` argument.

### Findings worth remembering
- `npx tsc --noEmit -p .` checks nothing; use `-p tsconfig.app.json`. The build is `vite build` (no tsc); compare errors against a baseline.
- 18–24 Oct is a deliberate break week (planner "Combined Service" stops FOF; Week 2 class date is 25 Oct). No Week row was added.
- My mock cannot render Birthdays (wrong data shape for its own queries); Corporate prayers and Birthdays were left as they were.

### Open
- Apply the migration above after the deploy (owner to say when).
- Meeting-time bypass (a Support can move the time to "now"): offered, undecided.
- Website and Practice files keep their 7 type errors; the Practice and Website pages were out of scope.
- The Stop hook keeps asking to re-author commits as Claude; declined each time. Commits stay Sam's.
