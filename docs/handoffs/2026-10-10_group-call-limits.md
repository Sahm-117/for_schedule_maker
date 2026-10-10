# Group call limits (Settings) and the message box fix

## Summary
- **Settings > Group call limits** (admin): choose the days, the earliest start, the time a call must finish by, and the allowed lengths for a group's weekly call. Default is the old fixed rule (Wednesday, Friday, Saturday; start 5:00 PM or later, finish by 9:00 PM; 45 minutes or 1 hour), so nothing changes until an admin edits it.
- The meeting-time picker follows the limits (days offered, start times in 15-minute steps up to the latest that still finishes in time for the shortest length, allowed lengths), the hint text reads them, and saving a slot outside them shows why. A slot saved earlier that is now outside the limits still shows (it is added to the list), so nothing looks blank.
- The database enforces the same limits for supports: a change to a group's meeting day, time or length outside them is refused with a plain message. Admins are not held to them; hub meetings are unchanged. A group already outside the limits keeps working and can still change its call link.
- **Message box:** on a phone the round Need support button no longer pushes the send button off to the left. While the group message box shows, that button lifts above it, so the box and its send button use the full width.

## Live changes
- Migration `20261014300000_group_meeting_limits.sql` (applied live): `group_meeting_limits()`, trigger function `group_meeting_limits_guard()` and trigger on `Group`. No `AppSetting` row is created until an admin saves, so the defaults apply. FLOW_MAP rule 61.
- No edge function changes.
- Frontend: `utils/groupMeetingLimits.ts`, `hooks/useGroupMeetingLimits.ts`, `components/settings/GroupCallLimitsCard.tsx`, `AdminSettingsPage.tsx`, `GroupMeetingSlotEditor.tsx`, `GroupCallCard.tsx`, `settingsApi` (supabase-api, api.ts); `DiscussionFeedView.tsx` and `NeedSupportButton.tsx` for the message box.

## How it was tested
- Live database, in a block that was rolled back, with temporary support and admin sessions: a valid slot passed; Monday, too early, too late and a 90 minute length were each refused with the right message; changing only the call link passed; with tighter limits saved (Saturday, 6 to 8 pm, 45 minutes) a Saturday 7:00 pm slot passed and 7:30 pm was refused; an admin could set any slot. The setting row was rolled back (none left).
- Browser (local app, mocked backend): the Settings card shows the default text, saves the edited limits, and shows the new text; with Saturday / 6 to 8 pm / 45 minutes saved, the New Group meeting picker offered only Saturday, 6:00 to 7:15 PM and 45 minutes. The participant My group message box: send button at the right edge, help button above the box. No console errors.
- NOT tested: a support saving through the real app against the live trigger, other pages that show the help button below a message box, desktop width for the message box (unchanged there).

## Open items
- Hub meetings and other admin-set meetings are still any day, time and length.
- The Dashboard/Supports "no meeting time" step (see the groups onboarding glance handoff) does not look at the limits; a slot outside them still counts as set.
