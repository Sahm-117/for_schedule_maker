# Support scripture card stuck on Day 1 inside Practice

Date: 2026-10-31. FLOW_MAP rule 45.

## Report
A support said the Inspirational Scripture on his phone was stuck on Day 1, while his desktop was fine.

## Cause
- The support Home card counts days from the start date of the cohort being viewed.
- While Practice is on, `practice_pulse` moves the Practice cohort's start date to today on every beat, so in Practice
  the card was always Day 1.
- The chosen cohort is remembered per device, so his phone had been left in Practice and his desktop was on
  Cohort 10.
- Replay of his desktop visit on 30 Oct showed Cohort 10 and day 20. His phone visits have no recording.

## What changed
- `scriptureCohortStart` in `utils/participantApp.ts`: inside Practice the card follows the real cohort last viewed
  (`fof_last_real_cohort`), otherwise the newest unfinished one.
- Used by `SupportHomePage`; outside Practice nothing changes.
- 4 new tests in `rules.test.ts`.
- The owner had already switched Practice off. That removes supports' access to the Practice cohort, so a phone left in
  Practice falls back to the running cohort on its next cohort check.

## Also done today (PostHog)
- The 12 "Staff device not linked to an account" views were linked to the owner's admin account with `$create_alias`,
  after checking that every view carried the same PostHog device id and screen size as the owner's own Mac.
- That group is now empty.

## Open items
- The participant Home card (`InspirationCarousel`) has the same weakness when staff rehearse in participant view
  inside Practice. Not changed.
- Rule 45 says day N opens at 2:00 PM Lagos, but `daysIntoCohort` counts from midnight Lagos. This was left as it is;
  check which one is meant.
