# Mobilisation cards, teens on the form list, discussion line

## Summary
- Mobilisation cards (support page) now use the Dashboard's count: Target is everyone registered with "x adults, y teens" beneath it, Onboarded is adults, and a new Teens
  card beside Target shows registered teens with "1 wrong number left out" and "x from the form + y added by hand". Prospects unchanged.
- "Registered on the form": teens get a Teen chip and "Number hidden"; a Wrong Number contact gets a Wrong number chip;
  a teen's number is not searchable.
- The admin "Discussions this week" line no longer counts teen groups (no in-app discussion there).
- Three test form rows removed. `push-reminders` redeployed.

## Live changes
- Edge function `push-reminders` deployed, now v42 (adds the venue map to the 7pm reminder, skips people who attended).
- Migration `20261009100000_discussion_summary_no_teen_groups.sql` applied (only the group filter changed).
- Data: 3 test rows deleted from `SheetRegistration` (no linked contacts). No schema change.

- Vercel: old deployments deleted in both projects linked to this repo (`for-schedule-maker` 371, `backend` 372), keeping the newest two of each at the time. Deployments only; no project, domain or setting changed. Both projects build every push to `main`, so storage refills; a retention setting in Vercel would stop that.

## Decisions and why
- Cards follow the Dashboard so the two never disagree (Target was counting only contacts at a registered stage, so it
  was 70 where the Dashboard counts 76 people; adults are 63).
- Teen number hidden in the app only: the table still returns it to a signed-in support. Hiding it at the database
  would need a view or function; not done.

## How it was tested
Playwright with a mocked backend (4 adults, 4 teens incl. a wrong-number one, hand-added teen): card values, chips,
hidden numbers and search checked; build passes. Not run against a real support login.

## Open items
- `participants`/onboarding progress for admins still lists teens (no login) as not onboarded.
- Teen numbers still reach the browser; hide at source if that matters.

## Gotchas
- A teen's number is dropped from the form rows, so the "already registered on the form" check when saving a prospect no longer matches an unlinked teen row by number.
- If the people list fails to load, Target, Onboarded and Teens show "Counting…" (Prospects still shows).
- The "from the form + added by hand" line reads only the first 500 form rows and hides itself when it can't add up.
- A teen with no follow-up contact (form only) still shows the Teen chip via the form's age answer.
