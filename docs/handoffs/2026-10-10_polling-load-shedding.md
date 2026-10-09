# Polling load-shedding for the free database

## Summary
- Worry: many people on the app at once (a Sunday register, a group meeting, and later the 9pm prayer) on the free Supabase tier. A review plus a timing test
  found the database is not the bottleneck yet (`participant_home` averaged about 4 ms, worst 10 ms, at most 12 KB, over 60 real participants, warm, one caller at a time;
  rolled back). The waste was in the app: every open tab, hidden or not, polled on fixed timers all in step, and one failed background poll blanked the Home page, which made people
  tap "Try again" at exactly the wrong moment.
- New `hooks/usePolling.ts` (`usePolling` hook and `startPolling` for code already inside an effect): runs only while the tab is visible, jittered +-20%, skips a poll while
  the last one is running, and catches up once (after 0-1.5 s) when the tab returns after a missed poll.
- Moved onto it: the participant home (one timer, 20 s while a register is open or the group meeting is on, otherwise 60 s, replacing three), the notification bell, the teen gate,
  the group-meeting-live hook, the announcements feed/admin/modal, training attendance, support attendance, follow-ups (support and admin), mobilisation (two), the hub meeting panel (two),
  and the staff fallback poll in `AppDataContext`.
- `ParticipantAppContext`: a failed background poll keeps the last good data (only the first load can show the error card); the newest request wins; a response that started before a local
  save (`applyReflection`, `applyCheckIn`, `applyManualQuestion`, `applyManualNote`) is dropped so it cannot wipe it; returning to the tab no longer reloads twice.
- `AppDataContext`: the Realtime-triggered workspace refresh waits 0.3-1.8 s (random) and is held while the tab is hidden, then runs on return. The notification poll was already visible-only.
- `useAuth`, the bell and `useGroupMeetingLive`: `focus` and `visibilitychange` fire together on return; each now acts once.
- FLOW_MAP rule 51.

## Live changes
None. Frontend only. No migration, no function deployed.

## How it was tested
Browser test with a mocked backend and a fake clock, on the old and the new code:
- Participant app, 5 minutes visible: 5 polls both before and after. 5 minutes hidden: 5 polls before, **0 after**. Back in view: one refresh.
- A failing `participant_home` (500) for two minutes: the old code showed "Could not load your FOF space"; the new code keeps the page.
- Admin follow-ups page: hidden for 5 minutes, 0 requests (it was polling every 30 s); back in view, one catch-up load.
`npx tsc --noEmit -p tsconfig.app.json` still shows only the 27 old errors, `npm run build` passes, and `git diff --check` is clean.
NOT tested against the deployed backend, with real logins, or under real concurrent load (no load generator here). The stale-response guard was reasoned through, not exercised in a browser.

## Open items
- The 22 Realtime table bindings per staff session are unchanged: the app comment says staff-only tables may not deliver to the anon Realtime connection at all, so which bindings do anything is unproven. Trimming them is
  the next saving, but removing one blind could stop a live update. Measure first (Realtime messages in the Supabase usage page).
- The separate `user-status-<id>` channel in `useAuth` is also untouched for the same reason.
- If load is still a problem after the next busy Sunday: a small `participant_live` function (register open, meeting live, prayer focus) for polling, so the full `participant_home` loads only on open and on return. Needs a migration and approval.
- Design the 9pm prayer screen to run its countdown on the client, poll slowly with jitter, and batch its writes.
- The Supabase free tier has no daily backups and pauses a project after about a week with no activity. Export your data on a schedule.
