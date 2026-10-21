# Scripture notification reaches supports; send-now switch

## Summary
The daily Inspirational Scripture notification now goes to supports as well as participants. A protected "send now" switch sends today's scripture notification and nothing else. Used once on 21 Oct, because that day's post had opened at midnight before the new function was live.

## Shipped
- `supabase/functions/push-reminders/index.ts`: `sendScriptureDrop(todayIso, dryRun, debug)` sends the bell row and push to participants with an active login and to every non-test support in the current programme cohort (`UserCohort`, `isSupportOrTagged`). Each person gets it once a day: `ParticipantReminderLog` `SCRIPTURE:<date>` for participants, `PushReminderLog` kind `SCRIPTURE` for supports. The 5 AM window (block c2) calls it, except in test runs limited to participants or a cohort.
- `{ "scriptureNow": true }` (with `dryRun` if wanted) runs only `sendScriptureDrop` for today. It needs `Authorization: Bearer <project secret key>`; without it the reply is 403.
- FLOW_MAP rule 83.

## Live changes
- `push-reminders` deployed as v56 on 2026-10-21 (Management API).
- Fired once on 2026-10-21 at about 09:40 Lagos: 75 participants (33 with a push device) and 49 supports (42 with a push device) got "Today's scripture is here"; everyone also has the bell row. Tomorrow's 5 AM run is unaffected (new date, new claims).

## Gotchas
- The function's `SUPABASE_SERVICE_ROLE_KEY` matches the project's new `sb_secret_…` key, not the legacy service_role JWT. Use the secret key for `scriptureNow`.
- Running the whole function with `asOf` to replay a moment also replays other reminders (recap, manual). Do not use `asOf` to resend the scripture: use `scriptureNow`.
