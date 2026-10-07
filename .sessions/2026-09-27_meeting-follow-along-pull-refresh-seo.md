# Session: Link previews, pull-to-refresh, participant meeting follow-along, unfinished-meeting reminders

**Date:** 2026-09-26 → 2026-09-27
**Branch:** main
**Session ID:** cde5dd10-00a2-4d32-84e8-fd517d76a32f
(Supersedes the auto-written stub `2026-09-26_session-cleared-no-work.md` for the same session ID.)

## What Was Done
- **SEO / link previews** — static OG/Twitter/description tags in `frontend/index.html` + branded 1200×630 `frontend/public/og-image.png`. Pushed `b0f7928`, verified live on fof.tcnikorodu.org.
- **Pull-to-refresh (installed PWA only)** — tiny pull springs back; short pull (≥70px) → release → 3s countdown with Cancel; long pull (≥200px, raised from 150 at Olamide's request) → instant refresh. Pulled area uses the user's accent with auto-contrast (≥4.5:1, deepens colour if needed). Refresh applies a waiting SW update; update banner kept. Pushed `11e55ac`, verified live.
- **Participant group-meeting follow-along (My Group, only while meeting is live)** — follows the support's step:
  - Support on Prayer → "Now praying for <name>" (+ faith project text only if APPROVED and sharedForPrayer; otherwise name only). "Waiting for <support> to pick someone…" before a pick.
  - Support moves past Prayer → "Prayer finished ✓" + that week's recap (sent even before participant release time, only to that group, only during the meeting, only if week shared).
  - Support moves past Recap → "Week N recap · Meeting completed ✓ / Drop your reflection now." + "Write my reflection" → `/me/week/N` if released, else `/me/journey`.
  - Going Back reverses each stage. Submit ends it. Participant home polls every 20s while live.
- **Live nav dot redesigned** (`LiveNavDot`): dot on icon corner, cut-out ring, glow, two staggered sonar rings (reduced-motion safe). Used in participant + support navs.
- **Meeting banners tappable** — participant Home banner → My Group (Join still → call link); support banner whole-tap → meeting.
- **Support banner/nav open the live meeting's week** (`?week=<id>`, honoured by SupportParticipantsPage even when already on the page). Bug was: it opened the "ideal" week (already submitted) → no Submit button.
- **Unfinished-meeting reminder (support Home, current cohort only)** — amber "Your Week N meeting isn't finished" with Finish report / Discard (in-page confirm). Excludes the currently-live meeting (green banner covers it).
- **Instant live refresh** — `notifyGroupMeetingChanged()` fired from `meetingAttendanceApi.mark`, `groupPrayerStatusApi.setDone`, `discardUnfinished`; `useGroupMeetingLive` + Home card listen.
- Cleared 4 Week 3 test MeetingAttendance rows for ZZ Demo Group (backup in session scratchpad `backup_week3_meeting_attendance.json`).

## Files Changed
- `frontend/index.html`, `frontend/public/og-image.png` (pushed)
- `frontend/src/components/PullToRefresh.tsx`, `App.tsx`, `hooks/usePWAInstall.ts` (export isInStandaloneMode), `index.css` (pushed; index.css also has new unpushed sonar keyframes)
- UNPUSHED: `components/LiveNavDot.tsx` (new), `utils/meetingLiveEvents.ts` (new), `components/AppShell.tsx`, `components/participantApp/ParticipantShell.tsx`, `components/groups/MeetingModePanel.tsx` (goToStep + onPrayerFinishedChange/onRecapFinishedChange), `context/ParticipantAppContext.tsx` (20s poll while live), `pages/ParticipantGroupPage.tsx`, `pages/ParticipantHomePage.tsx`, `pages/SupportHomePage.tsx`, `pages/SupportParticipantsPage.tsx`, `services/api.ts`, `services/supabase-api.ts`, `hooks/useGroupMeetingLive.ts`, `types/index.ts`, `index.css`
- Migrations (untracked files, ALL ALREADY APPLIED to live DB, each trialled in a rolled-back transaction first):
  - `20260927090000_participant_group_prayer_focus.sql` — participant_home.groupPrayerFocus
  - `20260927100000_group_prayer_finished.sql` — GroupPrayerStatus.prayerFinishedAt + groupMeetingLive.prayerFinished
  - `20260927110000_group_recap_finished.sql` — GroupPrayerStatus.recapFinishedAt + groupMeetingLive.recapFinished
  - `20260927120000_group_meeting_live_recap.sql` — groupMeetingLive.recap (early recap during live meeting)

## Key Decisions & Patterns
- participant_home is always CREATE OR REPLACE'd verbatim from the latest migration + additive fields; verify live `pg_get_functiondef` matches the file before editing.
- Group meeting "live" = earliest MeetingAttendance.markedAt within 3h and GroupPrayerStatus.done not true. GroupPrayerStatus.done = report submitted.
- Faith project shown for prayer only when `status='APPROVED' AND sharedForPrayer` (same rule as hub_prayer_list).
- Recap sharing: admin's per-week "share with participants" is always respected; only release *time* is bypassed during a live meeting.
- Unfinished reminders only for the support's current (active) cohort — 13 old unsubmitted Cohort 9 (COMPLETED) meetings from 20 Sep exist and must not nag.
- Pull-to-refresh: fixed overlay panel (not translating #root, which would break fixed children); only in standalone mode; `overscroll-behavior-y: none` in standalone.
- Playwright test logins: minting AppSession rows was blocked by the permission classifier earlier (reading another session's db helper); UI testing was done by Olamide on phone via `http://<LAN IP>:5199` (vite --host). DB checks via scratchpad `db.js` (pooler host `aws-1-eu-west-2`).

## Backend / Handoff Notes
- 4 migrations above are live in Supabase but their files and the frontend that uses them are NOT committed/pushed yet. Push everything together after Olamide's OK (show push details first).
- Pre-existing TS errors (26) and some lint errors exist in untouched code; new code adds none.

## Pending Tasks
1. **Awaiting approval — hub meeting fixes (same lessons as group meeting):**
   1. Hub banner/nav open the live week — currently My Hub meeting tab defaults to the highest week (Week 10); add `?week=` + honour it / default to live week.
   2. Hub Review & Recap step shows the week's recap during a live hub meeting even before support release time (currently "This week's recap isn't out yet").
   3. Amber "Your Week N hub meeting isn't finished" card on Home for hub leads/assistants with Finish report + Discard (needs a new SECURITY DEFINER RPC; SupportSession has no write policy for supports; same permission as submit).
   4. Group meetings only count the newest unsubmitted meeting as live (like hub already does) — in `useGroupMeetingLive`/`getLiveForGroup` and participant_home.
2. Open question to Olamide: open that week's reflection early for the group when the support closes Recap (so "Drop your reflection now" works for unreleased weeks, e.g. Week 5 before Mon 28 Sep 6pm).
3. Test on phone: completed card + reflection button, amber card Finish/Discard, banner → live week, instant dot clear after submit.
4. ZZ Demo Group test data: Weeks 5 and 6 test meetings were submitted (reports exist); Week 3 GroupPrayerStatus/GroupPrayerFocus rows remain (attendance cleared). Offer cleanup.
5. Commit + push all unpushed work (show actor/author/destination first).
6. Older pending: hub lead test (assign Test Support as demo cohort lead on admin Hubs page); checklist test 17.26 (blocked by account access).

## Errors Hit & Fixes
- Week 5 recap not showing in meeting → participant release time (Mon 28 Sep 17:00 UTC) not reached → added early live recap.
- "Meeting still on" after submit → an older unsubmitted Week 3 test meeting was still live; later, a 60s polling lag → added instant refresh event.
- Banner opened a submitted week with no Submit button → added `?week=` live week.
- Python `str.count` substring collisions when replacing indented JSX (shorter indent matched inside longer) → replace longer/unique anchors first.
- Piping a transaction script into `head` killed it with EPIPE mid-transaction → Postgres auto-rolled back; verified nothing persisted. Write output to a file instead.
- grep treats `supabase-api.ts` as binary in this shell → use `grep -a`.
