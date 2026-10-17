# Support Home redesign (first support page)

## Summary
First page of the approved supports redesign. Frontend only: no migrations, no functions deployed.

## Shipped
- Support Home: the "Programme progress" box and the four quick links are replaced by a Next class card (class title, week, teacher chip, Open classes) and a "Your group" list (next group meeting, faith projects, My Hub, join group call, Practice). Hub-only supports get "Your hub" (next hub meeting, My Hub).
- Mark attendance / Open hub meeting button, alerts, surveys, Today and the checklist are unchanged.
- Tour steps for Home reworded to match.

## Live changes
None.

## Decisions and why
- Rule 66 kept: a hub-only support's next hub meeting still comes from their own hub. The tile's own Join Call button is gone; the live banner and My Hub still join the call.
- The design canvas was approved by the user ("You can start implementing"); pages are built one at a time, Home first.

## How it was tested
Type check (no new errors beyond the 7 known) and vite build. Looked at in a browser with the backend mocked, so no real data was shown.

## Open items
- Remaining support pages from the canvas are not built yet: My Group, Schedule, Mobilisation, Follow-ups, My Hub (and its role views), hub meeting steps, Attendance, Classes, Community, Announcements, Resources.
- Not checked against real data with a class and teacher set.

## Gotchas
- `data-wt` targets `home-metrics` and `home-quick-links` now sit on the new cards; the tour depends on them.

## Addendum: tabs, My Hub, Schedule
- Every support tab bar now uses the person's accent (Attendance, Follow-ups, Mobilisation, My Group, Schedule, My Hub).
- My Hub: the Hub Leads tab is gone from the bar; Hub Leads see the meeting as a card at the top of My Hub (`?tab=leads` still opens the full page, so the Practice step keeps working; its hint was reworded).
- My Schedule: Today / Tomorrow / Full week are chips instead of a dropdown.
- Not rebuilt yet (the app already behaves as the canvas shows, only the look differs): Mobilisation, Follow-ups, Classes, Community, Announcements, Resources, and the hub role views beyond what exists today.
