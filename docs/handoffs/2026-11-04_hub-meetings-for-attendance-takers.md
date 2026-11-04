# Hub meetings tab for attendance takers

Date: 2026-11-04. FLOW_MAP rule 131. Frontend only. No migration, no function deploy.

## What changed
- The supports ticked in "Who can mark trainings" now have three tabs on their Attendance page: Participants,
  Trainings (renamed from "Supports (trainings)" so it fits on a phone) and Hub meetings.
- **Hub meetings** shows every hub for each week that has started:
  - whether the report was submitted, started or not started, and who submitted it;
  - the Present, Late, Absent and Excused counts;
  - "See who" lists each member's mark.
- It is seeing only (owner's decision): no marking, and no notes. The notes are removed as the reports load.
- It reuses the admin Hubs page's `HubReportsCard` through two new props, `showNotes` and `defaultExpanded`. The admin
  view is unchanged.
- `supportHubsApi.getNames(userIds)` reads only `id, name`, so the tab doesn't load full user records.

## Tested
- In the browser as one of the two attendance takers, with every write, write-looking RPC and function call
  blocked:
  - the tab showed week 3 with 5 of 6 hubs submitted, and weeks 1 to 3 to pick from;
  - "See who" listed each member's mark;
  - no notes appeared anywhere, and there were no console errors.
- The temporary session was deleted.
- `npm run build` passes.

## Gotchas
- Marking a hub's meeting is still limited to that hub's lead or assistant lead, and admins. Giving attendance takers
  marking rights would need a change to the mark function's permission check. The owner said no.
