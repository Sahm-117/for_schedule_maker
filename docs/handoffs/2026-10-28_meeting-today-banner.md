# Hub meeting-today banner on the support Home

Date: 2026-10-28. Frontend only: no migration, no function.

## What changed
- Support Home shows a green banner (same look as the "on now" banner, above the Next class card) "<Hub> meeting today" from the start of the meeting's day until an hour after its start (Lagos time, as long as the call can be joined). Its Join button opens the hub's call link directly once the call opens (10 minutes before); before that it says "Starts 8:00 PM" with an Open button to the meeting page. The green "on now" banner replaces it while the meeting is live.
- The "Your hub" row reads "Hub 1 · Today · 8:00 PM" on the day, instead of the weekday.
- `meetingTodayState` and `meetingClock` added to `utils/joinWindow.ts`; the join window itself is unchanged.

## Decisions (from code review)
- Hubs only. A group banner was tried and removed: the group's Home row already shows its meeting, a teen group's meeting is handled by its own card, and a support with several groups needed more care.
- A 15-minute tail was tried after code review and reverted the same day: a support opening Home 30 minutes into the meeting saw no banner and no way in. The banner now lasts the whole join window (an hour), at the cost of still showing for a meeting that finished early (the app has no cheap signal that a meeting was already recorded).

## Tested
- `tsc`, `npm run build`; mocked-backend Playwright with a fixed clock (Lagos): 7:30 PM "Starts 8:00 PM / Open"; 7:55 PM and 8:10 PM "join now / Join" with the call link; 8:31 PM still "join now"; 9:05 PM and Thursday: nothing. Hub-only kind not exercised (a hub member is enough). Not tried against live data.

## Open items
- The banner shows every week on the hub's meeting day, including rest weeks and after the cohort ends (it does not read the cohort calendar).
- Admin Supports page and the support Schedule page show no "meeting today" cue.

## Addendum: "on now" banner names the hub
- A support reported "Hub meeting is on now" still showing an hour after their own hub's meeting. It was a different hub they cover as IT support (started, never submitted), and the banner did not say which. It now reads "<Hub> meeting is on now", one banner per live hub, and Join opens that hub (`/support/my-hub?tab=meeting&hub=<id>`; My Hub honours `hub`). Home shows it for one hour after the meeting was started (attendance marked), whether or not it was submitted; the server's `meetingLive` still counts 3 hours, so the nav dot and My Hub meeting tab are unchanged.
- Live data finding, no change made: two hubs had a meeting started on 28 Oct and not submitted when this was reported.
