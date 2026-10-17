# Pause automatic reminders

## Summary
A combined church service replaced the FOF class on Sunday 18 Oct, and the automatic reminders would have told participants to go to class and to the venue. Admins can now pause some automatic sending from Settings.

## Shipped
- Settings > Programme > "Pause automatic reminders": two switches (class and service reminders; support schedule reminders), each with an optional "Start again after" date.
- Class and service reminders are paused through Sun 18 Oct (live setting).

## Live changes
- Edge function `push-reminders` deployed as v53. It was built from the live-matching v52 tree plus the pause check only; the repo copy also carries the undeployed Team-member birthday-viewer change, which is still not live.
- Data: `AppSetting` row `reminder_pauses` = `{"class":"2026-10-18"}`. No migration.

## Decisions and why
- The Saturday 5 pm and 8 pm venue-map pushes for Sunday had already gone out to 75 participants before the pause existed. Only the Sunday 6 am one was stopped.
- The Sunday class nudges would not have fired anyway (Week 2's class date is already moved to 25 Oct), but the venue-map reminder keys off the first two Sundays of the cohort, not off a class.

## How it was tested
Dry run of the function as of Sun 18 Oct 6:05 am: with the pause, nothing for the venue map; with the pause set to the day before (control), it listed "Today at FOF" for 75 people. The pause was then set back. The Settings card was seen against mocked data.

## Open items
- Decide whether the 6 am venue-map reminder should keep running on the second Sunday in future cohorts.
- The "support schedule reminders" switch has not been used live.

## Gotchas
- `asOf` in a dry run only moves the participant block; the first debug line still shows the real time.
