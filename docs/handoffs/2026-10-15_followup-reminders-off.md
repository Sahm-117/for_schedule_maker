# Follow-up reminders off once the cohort has started

## Summary
Supports (mostly the five Teen Supports) were still getting the daily 8 am "Follow-ups need attention" push and the 9 am / 12 pm / 4 pm / 9 pm "No activity on your follow-ups" nudges after Cohort 10 started on 11 Oct. Both reminders now only run before the current cohort's start date. Other follow-up alerts (new assignment, passed on, issues, "is in the app", and a support's own "Follow-up due" dates) are unchanged.

## Live changes
- Edge function `push-reminders` deployed as **v51** (v50 before). Built from the repo as it was live (the undeployed roles-and-permissions change to the birthday alert recipients was left out on purpose) plus the new `cohortHasStarted` guard. The repo copy contains both the roles change and this change, so a later deploy of the repo copy ships the roles change too.
- No migration.

## How it was tested
Dry runs against the live function before and after the deploy, at ten moments (9:05, 12:05, 16:05, 21:05 today, 19:05 today, the Saturday and Sunday venue map moments, the Sunday 6 am one, and two on 16 Oct). The only differences were the follow-up "No activity" alerts (3 per slot before, 0 after) and the wall-clock minute in the header. The 8 am push is not exercised by dry runs (it never runs in one); it uses the same guard. Not tested: a real 8 am run tomorrow.

## Open items
- Open follow-ups still exist (7 adult prospects not yet registered, and teens). Nothing closes or moves them; decide whether unregistered people should move to the next cohort.
- Whether teen statuses should have been skipped by these reminders all along (they were counted as open) is now moot while the reminders are off.
