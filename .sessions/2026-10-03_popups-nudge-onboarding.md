# 3 Oct: hub prayer fixes, cards on phones, passwords, install videos, popups, app nudge, onboarding trim

## Built (all on `main`; last push `d98b42d`, plus the unpushed commit noted at the end)
- **Hub prayer list** only shows Faith Projects from groups in the hub's own cohort (practice prayers were showing in real hubs): migration `20261003100000_hub_prayer_list_own_cohort.sql`. `set_hub_prayer_focus` and `birthdays_list` got the same cohort / ZZ-demo guard (`20261003110000_practice_leak_fixes.sql`).
- **Hub meeting prays for 3 Faith Projects** at a time (`HubMeetingPanel`): anything prayed this week stays in, the rest go to the least / longest-ago prayed; it cycles; fewer than 3 shared repeats those.
- **Join Call buttons** (`components/JoinCallButton.tsx`, uses `utils/joinWindow.ts`, 10 min lead): grey with "Opens 10 min before the meeting" on My Hub, Hub Leads tab, the group call card and participant Home; open early when the meeting is live.
- **Tables to cards on phones** (table kept from tablet up): Participants, Faith projects, Supports weekly report, Group prayers, Rota, import preview, trend table. Participants / Faith projects are compact inset lists; Group prayers and Rota collapse. Fixed the retaker-confirm bug (`user` undefined) on the Participants page.
- **Participant passwords**: 5+ characters, no maximum, live "✓ Matches / Does not match" note (`ParticipantWelcomePage`); `set_participant_password` / `change_participant_password` changed to 5 (`20261003120000_participant_password_min_5.sql`). Staff and admin stay at 8. Existing passwords untouched.
- **Android "You already have the app" bug**: server answer is now tied to the sign-in token (`useAppServerState`), and on Android it waits up to 2.5 s for Chrome's install prompt (`useAppSetup`); the box has "If you have never installed this app, tap here."
- **Install videos** (Loom, `constants/installVideos.ts`): Welcome guide, "No alerts" WhatsApp message, login WhatsApp/email messages, staff invites, and a Watch-the-video button on the participant Get the app page.
- **Popup queue** (`utils/popupQueue.ts`): one popup at a time, priority order, soft popups limited to 2 a day per device. Wired into `AppShell` and `ParticipantShell`.
- **Announcement popups**: `Announcement.requirePopup`, `AnnouncementPopup` (who was sent it / who tapped Got it), RPCs `announcement_popups_pending / _ack / _status` (`20261003130000_announcement_popups.sql`); `send-announcement` v21 takes `popup: true` and records recipients; admin form has "Show as a popup" and the history shows "Popup · n of m said Got it". Component: `AnnouncementPopupHost`.
- **Get-the-app nudge** (`20261003140000_app_nudge.sql`): participants who signed in but are "Not installed" or "No alerts", to the support who followed them up (else their group's support), until the cohort start date. Home card `AppNudgeCard` (Send video opens WhatsApp with both videos) and a daily push 9am-7pm Lagos from `push-reminders` v36 (log table `AppNudgeLog`). Four new FOLLOW_UP templates carry the videos.
- Follow-up check wording: "participants" (also `run-followup-assignment` v4).
- **Onboarding trimmed**: support Onboard page is progress only (group bar, Start introductions, four auto-updating steps per person); the message picker and "Onboard a support" tab are gone. Admin Onboarding page: template library, coordinator settings and the template editor removed (progress, events and group status stay). Guide updated for both.

## Data changes made live
- 7 participants without a date of birth got a placeholder year 1904 with the month/day from the signup sheet (month/day is all Birthdays uses). They can correct it in their profile.
- Four templates added to `MessageTemplate`. The ONBOARDING (Day 1-3) and COORDINATOR template rows are still in the database, no longer shown anywhere.

## Not done / next
- **"Where we meet" card** on participant Home (map image and caption, set per cohort): the Day 3 venue template (with the map) is the only place the map lives, so keep that row until this exists. Needs two cohort fields and an admin form field.
- Admin "who will see what" popup preview not built (only the easy counts were suggested).
- `User.isCoordinator` and the coordinator API fields still exist but have no screen.
- First nudge goes out on the next scheduled run in the 9am-7pm window after the push job deployed (8 supports, 11 participants at the time).
- The Stop hook keeps asking to re-author commits as Claude; declined each time because AGENTS.md keeps Sam as the author.
