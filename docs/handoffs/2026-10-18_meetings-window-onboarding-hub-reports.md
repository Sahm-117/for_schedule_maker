# Meeting recording window, onboarding steps, hub reports

## Summary
- **Meeting recording window.** A meeting can be recorded only from 10 minutes before its set time until midnight (Lagos) that day; admins any time. It covers adult group meetings, Teen Support meetings and hub meetings (FLOW_MAP rule 77). A group or hub with no day and time cannot record at all. Teen groups now set a day and time on the teen meeting card.
- **No meeting lengths.** Durations are gone from every screen, and saving a meeting time clears any stored length (rule 78).
- **Participant Home.** "Get ready" sits above the cards and tiles. After the first class (Present, Late or Left early) the map, the guide and "ready for class" go. Only what is still missing stays: "Introduce yourself" (which they can tick themselves once their support has introduced themselves) and "Finish your profile" (rules 35, 75).
- **One readiness rule for staff.** "Attended + introduced + profile complete" counts as ready for the support's "x of y ready", the Groups chip, the Supports page and the dashboard's "groups aren't fully onboarded" warning (rule 75).
- **Support's "Get your group ready" steps.**
  - Shown at the top of My Group (every tab) and of the support's Home.
  - Ticked by the app only.
  - An admin can mark a step done or undo it from Groups > card menu > Support steps (rule 76).
- **Hub meeting reports.**
  - The admin Hubs page has a "Hub meeting reports" card: status, who and when, attendance, prayer, notes, and "Read report" for the full report.
  - The dashboard has a "Hub reports · Week N" line.
  - The dashboard's Class attendance and Group meetings tiles show the week in progress "so far" (rule 79).

## Live changes (database)
- Applied: `20261018100000_support_onboarding_override.sql` (table `SupportOnboardingOverride`, `admin_set_support_onboarding_override`, `onboarding_progress_json` returns `overrides`).
- `20261018110000_meeting_recording_window.sql` was tested on the live database inside a rolled-back transaction. It is applied together with the frontend push, so supports never see raw error codes on the old screens. **If it is not live, apply it with the push.**
- `20261018120000_participant_intro_tick.sql` (`ParticipantOnboarding.introTickedAt`, `participant_tick_intro`, `participant_onboarding_state` returns `introTicked`) was tested the same way and is applied with the push too.
- Data clean-up (approved: only records made before the cohort start, 11 Oct):
  - Deleted one group meeting row (prayer and recap ticked on 9 Oct).
  - Deleted 13 hub attendance marks from 1 Oct, across three hubs.
  - Deleted two empty hub meeting records from 1 Oct.
  - Cleared one hub's 4 Oct "prayer finished" time and set its start to its first real mark.
  - Kept a row created on 10 Oct whose ticks were on 11 Oct, and one hub's notes of unknown date.
  - A backup was taken in the working session's scratchpad (not in the repo).
- No edge function changes.

## Decisions and why
- **Window end.** Recording closes at midnight rather than at a meeting length, because meetings have no length and late marks and Submit must still work that evening. Owner's choice.
- **Early records.** Only records made before the cohort start were removed (owner's condition). Records made early but after 11 Oct were left, and the window stops new ones.
- **The window is enforced by triggers, not by the screens alone,** because the app writes `MeetingAttendance` and `GroupPrayerStatus` directly. Requests without an app session token (cron, service key) pass, so automatic finalising keeps working.
- **Practice cohorts are exempt,** so the Practice walk-throughs still work any time.
- **Readiness in the dashboard and Supports page** comes from `cohort_onboarding_progress` plus the groups' meeting details. `cohort_people` still has its older `onboarded` flag, which is used only when that data is missing.

## How it was tested
- `npm run build` passes. `tsc` shows the same errors as the last commit and none in the changed files.
- **Browser (Playwright) with a mocked backend:**
  - Admin: Hubs reports card and full-report window, dashboard line and "so far" tiles, the onboarding warning counting only the group that is really behind, Support steps window with Mark done and Undo.
  - Support: steps on My Group and Home; the meeting notice when open, before the window ("Opens Sat, 17 Oct, 3:50 pm") and with no time set.
  - Teen card: setting a time.
  - Participant Home: Get ready above the tiles; after attending, only "Introduce yourself" (with its tick) and "Finish your profile".
- **Database:** both migrations run against live data in rolled-back transactions.
  - A non-admin session outside the window is refused.
  - No time set is refused.
  - Training sessions are not affected.
  - System requests pass.
  - The windows land on the right days: Week 2 meets in the week of the 25 Oct class.

## Open items
- 10 adult groups and all 5 teen groups had no meeting time on 16 Oct. Once the window rule is live they cannot record until they set one (owner agreed).
- There is no Week for 18 to 24 Oct (no class), so a meeting held that week has no week to be recorded against.
- The admin pages for marking meetings (Group meetings page, hub Recap attendance) are not limited; admins can record any time.
- The per-person step pills on staff cards still show the raw five steps; only the counts and chips use the attended rule.
- The `meetingDurationMins` columns remain in the database; removing them needs separate approval.

## Gotchas
- `fof_meeting_window(day, time, weekId)` takes the first meeting day on or after `week_class_date` (a moved class need not be a Sunday); Lagos time is fixed at UTC+1 in `utils/meetingWindow.ts`.
- The screens re-check the window every 30 seconds (`useMinuteClock`); while the week is still loading they do not block (the database still checks).
- Errors come back as `MEETING_WINDOW_CLOSED: <opens>|<closes>`; `friendlyMeetingError` turns them into words.

## Added afterwards (frontend only)
- Staff step pills (participant profile, Onboarding page, group cards) use `participantStepDone`, so attended means Map, Guide and Ready show done.
- Group meetings page: `GroupReportsCard` (week chips, Done/Not done, joined, notes, "Read report"). Hubs `HubReportsCard` and this card are accordions, open by default.
- Open: a group report has text only when a prayer-focus participant was picked; the "concern" in the report is text in that note and does not open a flag.
- Admin redesign, batch 1 (frontend only): section tabs under the title (`SectionTabsContext`), Groups > Meetings tab, calmer group cards with a detail sheet (`GroupCard`), empty state on Group meetings. `GroupOnboardingStrip` is no longer used by the Groups page (its code is commented out, not deleted). Website and Practice pages are out of scope by the owner's choice.
- Admin redesign, batch 2 (frontend only): Dashboard "right now" lines in one card and a subtitle that says what needs you; Attendance summary in one card; Follow-ups, Faith projects and Planner header extras moved into ⋮; Allocation page titled "Allocation". The old `GroupOnboardingStrip` is commented out, not deleted.
- Hubs: the Hub meeting reports card starts closed (the Group meetings card stays open); the whole "Last recap / See week by week" strip is hidden on the Hubs page (`{false && …}` in AdminHubsPage, component untouched) because Hub meeting reports shows each week. The Hubs page never passed trainings to that strip, so nothing else was lost; trainings live on Supports > Trainings.
- Admin redesign, batch 3 (frontend only): Users list flags only "Inactive" (Active shows in the detail panel); Cohorts drops the repeated date chip, the repeated venue line and the "Cohort table" heading; Onboarding shows plain stats instead of four coloured tiles and folds "Recent activity" into a closed accordion. `MetricCard` in AdminOnboardingPage is commented out, not deleted.
- Group sheet (Groups page): each person shows chips for their five steps (tick when done), "Not signed in", their phone (iPhone, Android, Computer) and "Seen 8 Oct" or "Never opened". Read from the existing `participants_app_details()` and `participants_signed_in()`; no database change. Phone and last-seen chips are left out until that loads.
- Gotcha: `npx tsc --noEmit -p .` checks nothing (the root tsconfig has no files). Use `npx tsc --noEmit -p tsconfig.app.json`. The repo already had about 21 type errors before this work (build is `vite build`, which does not run tsc); compare against a baseline rather than expecting zero. The phone and last-seen chips on the group sheet appear only for an ACTIVE cohort.
- Admin redesign, batch 4 (frontend only): Approvals inbox uses the same card as the rest; Notifications no longer repeats "0 sent" under its headline; Scriptures subtitle is one line (its posting rule moved into the settings card). Birthdays and Corporate prayers were not visually checked: they crash in my mock because it returns the wrong data shape for their own queries, not because of these changes.
- Counting fix: the Onboarding page, the support's own onboarding page and the group overview counted people as "ready" by the `completed` flag alone, so a group whose members had all five steps ticked said "0 of 3 ready". They now use `participantFinished` (utils/supportOnboarding.ts), the same rule as the Groups and Supports pages.
- Removed (approved): `GroupOnboardingStrip.tsx`, `AttendanceSummaryStrip.tsx`, the unused `MetricCard`, the recap-marks loading on the Hubs page, the unused `coverRequestsApi` block, and unused variables/imports the compiler flagged. The compiler now reports 7 errors, all in `AdminWebsitePage.tsx` and `PracticeDock.tsx`, which were left alone on purpose.
- Group/hub meeting lengths: the app no longer sends or reads `meetingDurationMins` (the hub RPCs still receive an ignored `p_meeting_duration_mins: null`). Migration `20261019100000_drop_meeting_duration.sql` rewrites ten functions and drops the three columns. It was tested on live data in a rolled-back transaction, then **applied live on 2026-10-17** after the app version was deployed; afterwards no column and no function mentions `meetingDurationMins`. An app tab left open from before must be reloaded.
- Support Home: tapping the Inspirational Scriptures picture shows it full size (swipes still change the day). Type-checked and built; not looked at in a browser.
- Break week: 18–24 Oct is not a missing week. The planner has a "Combined Service" event (stops FOF) on 18 Oct and the Week 2 class date is 25 Oct on purpose. No Week row was added.
- Supports page: each card face shows one status word, the records line, one onboarding bar and chips only for what is off; the five steps, gender/age and hub moved under Details.
- Participant profile: Onboarding and Journey are one "Progress" card (five-step chips, the current stage, the full journey behind a closed toggle). Corporate prayers and Birthdays were checked and left as they were.

## How to pick this up
Read FLOW_MAP rules 35, 57 and 75–79, then `utils/supportOnboarding.ts` and `utils/meetingWindow.ts`.
