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
