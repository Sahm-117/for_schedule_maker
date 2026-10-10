# Polling load-shedding for the free database

Two commits: (1) `usePolling` and the participant/staff pollers; (2) the follow-up below (dead Realtime listeners, label N+1, caching, leftover pollers).

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

## Follow-up (second commit)
- **Realtime was dead for the staff app.** Live check: `pg_publication_tables` for `supabase_realtime` holds only `Notification`, which the app never listened to (and the public key cannot read). The 22
  `postgres_changes` bindings in `AppDataContext`, the `user-status` channel in `useAuth` and the two channels in `CommunityPage` subscribed fine but could never fire. All removed. `realtimeHealthy`
  (and the 15 s whole-workspace fallback poll it switched on) is gone with them. What replaces them: the notification check (every 30 s, was 10 s) which already offers the "Refresh" prompt, a 60 s hub-dot
  check, and in Community a 45 s topic-list poll and a 20 s comments poll while a thread is open (so new comments now actually appear without a reload). No full-workspace poll was added on purpose: it would
  add load, and notifications already cover what matters. The two Realtime BROADCAST channels (hub meeting, training attendance) do work and are untouched.
- **Label N+1.** `usersApi.withLabels(users)`: one `UserLabel` query instead of one per support (43), used by the admin Dashboard, Schedule and Activity Overview. (Fewer requests: 12 supports gave 24
  requests before and 2 after, in the browser test.)
- **Caching.** `vercel.json` serves `/assets/*` with `public, max-age=31536000, immutable` (they are hashed). All 11 storage uploads pass `cacheControl: '31536000'` (paths carry a timestamp, never overwritten).
  Objects already uploaded keep their old 1-hour header; re-labelling them is a storage change that needs approval. A service-worker cache for storage files was NOT added: those images load cross-origin
  without CORS, so the cache would hold opaque responses that count as ~7 MB each against the browser quota.
- **Leftover pollers** moved to `startPolling`/`usePolling` (jitter, visible-only, no overlap): practice pulse (background beat 12 s -> 20 s, so a practice invite can take up to ~20 s to appear), peer walkthrough, practice
  dock, admin practice, practice mode card, participant and support discussion dots, discussion tabs, app-nudge card, the PWA update check (60 s -> 120 s). Focus + visibility double-fires deduped in the
  update check and the nudge card.
- `useGroupMeetingLive`: a failed poll keeps the last value instead of hiding a meeting that is on.
- **Not done:** throttling the launch writes (`recordAppState`, push-subscription re-save). Each is one small upsert per launch, and the app-state answer drives the Get-the-app sheet, so caching or skipping it risked
  wrong sheets for no measured gain. Revisit only if the write rate shows in the Supabase usage page.

## Live changes
None. Frontend only. No migration, no function deployed.

## How it was tested
Browser test with a mocked backend and a fake clock, on the old and the new code:
Follow-up tests (same harness): opening the admin Dashboard with 12 supports sent 24 `UserLabel` requests on the old code and 2 on the new; staff notification polls in 2 visible minutes 12 -> 2; hidden 0.
- Participant app, 5 minutes visible: 5 polls both before and after. 5 minutes hidden: 5 polls before, **0 after**. Back in view: one refresh.
- A failing `participant_home` (500) for two minutes: the old code showed "Could not load your FOF space"; the new code keeps the page.
- Admin follow-ups page: hidden for 5 minutes, 0 requests (it was polling every 30 s); back in view, one catch-up load.
`npx tsc --noEmit -p tsconfig.app.json` still shows only the 27 old errors, `npm run build` passes, and `git diff --check` is clean.
NOT tested against the deployed backend, with real logins, or under real concurrent load (no load generator here). The stale-response guard was reasoned through, not exercised in a browser.

## Open items
- Backend ideas that need approval: an index on `Notification (userId, createdAt DESC)` and a lighter "anything new?" function (`my_notifications` is ~16 ms and ~14 KB a call); re-label existing storage objects
  with a long cache lifetime; trim `net._http_response` (14 MB for 36 live rows, about a third of the database); EXPLAIN the row-level-security cost (78 of 93 policies call `app_is_staff()` bare, not as
  `(select app_is_staff())`).
- If load is still a problem after the next busy Sunday: a small `participant_live` function (register open, meeting live, prayer focus) for polling, so the full `participant_home` loads only on open and on return. Needs a migration and approval.
- Design the 9pm prayer screen to run its countdown on the client, poll slowly with jitter, and batch its writes.
- The Supabase free tier has no daily backups and pauses a project after about a week with no activity. Export your data on a schedule.
