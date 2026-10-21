# Group calls last an hour: latest start is an hour before the end

## Summary
Follows `2026-10-21_group-call-window-end.md`. Every group call is now taken to last 1 hour (was 30 minutes), so the latest start is 60 minutes before each day's end time in Settings > Group call limits: Thursday 4:00 PM to 9:00 PM allows starts from 4:00 PM to 8:00 PM. The late-start popup says calls run for an hour and must finish by the end time; on Thursday it also says church prayers start at 9:00 PM.

## Shipped
- `frontend/src/utils/groupMeetingLimits.ts`: `CALL_MINUTES = 60`. Picker, slot check, rules sentence and the Settings hint all follow it.
- `frontend/src/components/groups/MeetingTimeFixPrompt.tsx`: "Group calls run for an hour and must finish by 9:00 PM." plus, on Thursday, "Church prayers start at 9:00 PM on Thursdays." The apology and "Change the time" / "Later" are unchanged.
- `supabase/migrations/20261021110000_group_call_one_hour.sql`: `group_meeting_limits_guard` uses end minus 60 minutes.
- Admin Groups page (separate commit): the hub chips also filter the Teen groups section (by the Teen Support's hub); chip counts include teen groups, so "No hub" shows when a teen group has none.
- FLOW_MAP rules 34, 61 and 85 updated.

## Live changes
- Migration `20261021110000_group_call_one_hour.sql`: applied live on 2026-10-21 (Management API) after `0928f8c` was live on Vercel. Checked in rolled-back transactions with a non-admin session: Thursday 20:15 refused ("must start between 16:00 and 20:00"), 20:00 accepted. The two 9:00 PM groups were left as they were.

## How it was tested
- `npm run build` passes; type errors unchanged (7, Website and Practice files).
- Helper logic against the live setting: Thursday offers 4:00 PM to 8:00 PM; 9:00 PM refused; Saturday 8:00 PM accepted.
- Cohort 10 groups the popup asks (adult, not archived, not Practice, allowed day, start after end minus 60): still only the two 9:00 PM groups.
- Not tried in a browser.

## Open items
- The call length lives in two places (`CALL_MINUTES` and the `- 60` in the trigger). Changing it again means both, or move it into the `group_meeting_limits` setting.
