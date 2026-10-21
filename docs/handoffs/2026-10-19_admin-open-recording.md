# Admin can open meeting recording for a week

## Summary
A hub lead's attendance taps all failed on Sun 18 Oct ("Couldn't save, try again"). The database only lets a hub or group meeting be recorded from 10 minutes before its time until midnight that day, and 18 Oct (the break week) had no week with that date. An admin can now open recording for one hub or group and week for 24 hours, and close it.

## Shipped (frontend pushed; database migration NOT applied)
- `supabase/migrations/20261019140000_meeting_recording_opening.sql`: table `MeetingRecordingOpening`, `admin_open_meeting_recording`, `admin_close_meeting_recording`, `meeting_recording_opening`, and `fof_assert_meeting_open` replaced (the live definition from 20261018110000 plus an early return while an opening is live). FLOW_MAP rule 84.
- `OpenRecordingModal.tsx`; "Open meeting" (was "Open recording") in the Admin Hubs and Admin Groups card menus; `useRecordingOpening` in `utils/meetingWindow.ts`, used by the hub meeting panel, the teen meeting card and the group meeting panel; `meetingRecordingApi`.

## Live changes
None yet. **To apply:** run the migration (in a rolled-back transaction first), then in the app open a hub's menu > Open meeting, pick a week, and check a Hub Lead's Meeting tab shows the recording steps instead of the "Opens …" notice. Until then the menu item errors cleanly and the app behaves as before.

## Decisions and why
- Per hub or group and week, 24 hours, by admin only; not a global switch.
- The app treats a missing function as "no opening", so the frontend can ship before the migration.

## Open items
- Not tested against the database or in a browser (no credentials or login here).
- Hub 4's lead saw the member list although the app should have shown the notice: the app lets the list show when it does not yet know the week or cohort start. Not changed.
- The generic "Couldn't save, try again" still shows on rows when the refusal is not a window one.
