# Announcements say which hub roles they were for

## Summary
An announcement sent to Hub Leads (or other hub roles) looked like a general one in the feed. It now carries a label such as "For Hub Leads and Assistant Hub Leads".

## Shipped
- Feed page and the Home "Recent announcements" card show the label.
- Support Home: the next-class card shows the class graphic on its right (tap to see it whole); Classes shows the graphic beside the next class and under each class that has one.
- Home list: one "My Hub" row (name and time) instead of three hub rows; the "My tasks" row is gone (the checklist card is right below).

## Live changes
- Migration `20261019120000_announcement_target_hub_jobs.sql` applied: nullable `Announcement.targetHubJobs` text[] with a check on the five hub roles. Tested in a rolled-back block (a bad value is rejected).
- Edge function `send-announcement` deployed as v26 (repo copy and deployed copy match; the only change is saving the roles on the row).

## Decisions and why
- The roles were only used to pick recipients and never stored, so older announcements (including ones already sent to hub leads) stay unlabelled. Nothing was backfilled.
- The Follow-ups "Next:" hint added earlier was removed again: the stored next action is wrong for parked and finished contacts.

## How it was tested
Type check, build, and the migration test. The label itself was only seen against mocked data; a real send to hub leads has not been done.

## Open items
- Send one test announcement to Hub Leads and confirm the label shows.
- Decide whether to label old announcements by hand.

## Gotchas
- Tag and single-hub targeting still show no label.

## Addendum
- Home: the "You're a <role>" cards are gone; the hub jobs show as a line under the My Hub row (for example "IT Support · Recap Lead").
