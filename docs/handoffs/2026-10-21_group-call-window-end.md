# Group call window end: no call starts at the closing time

## Summary
Settings > Group call limits now reads the second time of each day as when calls must **end**. Every call is taken to last 30 minutes (internal constant, not a setting), so the latest start is 30 minutes before the end: Thursday 4:00 PM to 9:00 PM allows starts from 4:00 PM to 8:30 PM, not 9:00 PM. Stored keys are unchanged (`latestStart` is read as the end), so the saved setting needs no rewrite.

## Shipped
- `frontend/src/utils/groupMeetingLimits.ts`: `CALL_MINUTES = 30`, `lastStartMinutes()`; the picker options, the slot check and the rules sentence ("between 4:00 PM and 9:00 PM (last start 8:30 PM)") use it.
- `frontend/src/components/settings/GroupCallLimitsCard.tsx`: second box is "End"; the hint and the per-day check (end at least 30 minutes after the earliest start) match.
- `supabase/migrations/20261021100000_group_call_window_end.sql`: `group_meeting_limits_guard` refuses a start later than end minus 30 minutes. Built on the live function body (after the meeting-length drop).
- `frontend/src/components/groups/MeetingTimeFixPrompt.tsx` (mounted in `AppShell`, queue place `meetingTimeFix` in `utils/popupQueue.ts`): a support whose group call starts after the day's last start (on an allowed day) gets a popup with an apology (and, on Thursday, that church prayers start at 9:00 PM), "Change the time" to My Group, or "Later" until the next launch. It stops once the time fits; nothing is changed for them. Used for the two groups already set at 9:00 PM instead of a push.
- FLOW_MAP rule 61 updated, rule 85 added.

- `frontend/src/pages/AdminGroupsPage.tsx`: hub filter as chips beside the Filters button ("All hubs", one chip per hub with its group count, "No hub" when any group has none). Several can be picked; it lives in the address as `?hub=` and is listed in the export's filter line. A group belongs to a hub through its support's `HubMembership`. A hub id from another cohort is ignored. Filters > Clear leaves the hub chips alone.

- Groups page: the separate Onboarding chip row (All / Overdue / In progress / Not started / Onboarded) is gone; Onboarding is chosen in the Filters sheet, as before. The "Day counts unavailable" warning stays under the filter line.

## Live changes
- Migration `20261021100000_group_call_window_end.sql`: NOT APPLIED YET (compiled on live inside a rolled-back transaction only).

## How it was tested
- `npm run build` passes; type errors unchanged (7, all in the Website and Practice files).
- Helper logic run against the live setting: Thursday offers 4:00 PM to 8:30 PM, 9:00 PM is refused, 8:30 PM accepted.
- Not tried in a browser: no login in this environment and no mock in the repo. Check the popup as a support and the hub chips as an admin after the deploy.

## Open items
- Two adult groups already have a 9:00 PM start (one Thursday, one Saturday). The guard only checks a change, so they keep working; their supports see the popup above until they pick a new time. Check after a few days that both moved.
- Teen groups use the same picker and guard, so a Teen Support cannot set a Sunday meeting (allowed days are Thursday, Friday, Saturday). The Teen Supports' meeting on 17 Oct asked for weekend recap times around 6 or 7 PM.

- Three groups with a Wednesday 8:00 PM call are Cohort 9 groups set in June/July, before the limits existed (10 Oct). Not an FOF 10 issue; the popup only reads the support's group in the cohort being viewed. No FOF 10 group is on a disallowed day.

## Gotchas
- The key is still called `latestStart` in `AppSetting` and `DayWindow`; it means the end of the window.
