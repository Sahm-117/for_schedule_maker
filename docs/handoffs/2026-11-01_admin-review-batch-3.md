# Admin review, batch 3: quick fixes and confirmed send buttons

Date: 2026-11-01. Frontend only: no migration, no function deploy. Commit `c61c106`. Works through items from
`2026-10-31_admin-review-remaining-work.md`.

## What changed
- **Surveys:** a survey that hasn't opened shows "Opens <date>" instead of "0 of N answered".
- **Community:** the admin menu entry shows "Last post <date>" (new read-only `hubApi.getLatestTopicAt`).
- **Approvals:** "Nothing waiting" instead of an empty page (the tab badge already existed).
- **Faith projects:**
  - Overdue pill once the write-by date has passed;
  - Overdue view, support filter and testimony count in the tab label;
  - "Remind supports" sends one announcement to the supports of overdue people (`announcementsApi.send`, SUPPORTS audience, target user ids). It confirms first and lists each support with their count.
- **Users:** "Last active" (`users_last_active`) and "In <active cohort>" replace Created.
- **Roles:** each role shows how many hold it; tapping it lists who.
- **Notifications:** grouped by type with counts; any send to 0 people is flagged.
- **Practice:** "In Practice right now" strip.
- **Follow-ups:**
  - the wrong-number warning links to each person;
  - "N adults have not signed in yet · Show who" lists them with "Resend login", which opens the existing login-details card (copy, WhatsApp or email). Nothing is sent automatically.
- **Participants:**
  - "Not in a group" card with Add to a group (existing move modal);
  - "Remind everyone missing details" on the profile-completion card (`participantPushApi.notifyOrThrow` → `notify-users`; teens left out).
- **Announcements:** "Send again to those who haven't seen it" (`notificationDeliveryApi.remind`).
- **Attendance:** "N need a support assignment" opens a picker for groups with no support (`groupsApi.update`). It doesn't create this week's follow-up task. People in no group are pointed to Participants.
- **Confirm step:** every send uses `ConfirmReachModal`, which shows the count and the names and is disabled at 0 people.

## Checks
- `npm run build` (tsc, 16 rule tests, vite) passes.
- Playwright as an admin with a temporary session (deleted afterwards):
  - all REST writes, write RPCs and edge functions were intercepted, so nothing was saved or sent;
  - 11 pages opened, and every new button was clicked;
  - 0 console errors;
  - phone width (390 px) had no sideways scroll.
- The saved test admin login (`TEST_ADMIN_EMAIL`) no longer exists in the database.

## Not done here
The items that need a database change or a function deploy. The rota items are not needed, because the rota isn't used.
