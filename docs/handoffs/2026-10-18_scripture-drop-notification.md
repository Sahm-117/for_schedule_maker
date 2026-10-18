# Daily scripture notification

## Summary
Participants get a push and a bell row at 2:00 PM Lagos when the day's Inspirational Scripture opens. Ten lines rotate, all telling them to read the post and do its exercise. Written in the repo; **not deployed**.

## Shipped (repo only)
- `supabase/functions/push-reminders/index.ts`: block "c2" in the participant section, plus `SCRIPTURE_DROP_LINES` and `SCRIPTURE_OPEN_MINUTES`. FLOW_MAP rule 83.

## Live changes
None. The edge function still has to be deployed. The repo copy of `push-reminders` also carries the undeployed Team-member birthday-viewer change from before; deploy from the live-matching tree or accept both.

## Decisions and why
- FOF day N opens at 2:00 PM on its own date (same rule as `scriptureDayIndex` in the app), so the push fires at the same moment the post appears.
- No "only if they haven't opened it": opens cannot be tracked. One push a day, cycling the ten lines by post number.
- Participants only (supports see the scriptures on Home but were not asked for).

## How it was tested
Not run: no Deno or Supabase credentials in this session. Brace balance checked only.

## Open items
- Deploy `push-reminders`, then dry-run it with `{"dryRun":true,"asOf":"<a 2:05 PM Lagos moment>"}` and check the debug line shows the expected count and the right line before it runs for real.
- Supports are not included; say if they should be.
