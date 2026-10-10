# Venue map reminders

## Summary
- Participants get a push and a bell notification to view the venue map: **Saturday 5:00 pm and 8:00 pm, then Sunday 6:00 am**, for the **first two Sundays from the cohort's start date** (for Cohort 10: 10/11 and 17/18 October). Saturday wording: "Tomorrow at FOF: After first service, view the venue map so you know where to go." Sunday: "Today at FOF: After first service, head to the New VIP Lounge. Open the venue map now so you know the way."
- Sent to every active participant of the running cohort, whether or not they have opened the map before. Skipping people who already ticked the map is a one-line change if wanted.
- Tapping it opens `/me?map=1`, which opens the venue map on the participant Home (the flag is then removed from the address). Until this frontend change is deployed, the link just opens Home.

## Live changes
- Edge function `push-reminders` deployed as **v45** (v42 before; v43 and v44 were earlier versions of this same block). v45 counts the first two Sundays on or after the cohort's start date, so a start date that is not a Sunday still works. FLOW_MAP rule 59.
- IMPORTANT: v45 was built from the repo as it was BEFORE the roles-and-permissions commit (`cb65c72`) plus the new block, because that commit's function changes were deliberately not deployed yet. So the repo copy of `push-reminders` is ahead of the live one by that roles change (the birthday alert recipients). Whoever deploys the roles functions should deploy the repo copy; it contains this block as well.
- No migration.

## How it was tested
- Live function, dry run (nothing sent) with a stand-in clock: it would send to 71 participants at 5:00 pm and 8:00 pm on 10 Oct, 6:00 am on 11 Oct, and the same three on 17/18 Oct; nothing at 5:30 pm, 7:00 am, or on 24/25 Oct.
- NOT tested: a real send (the first one is the 5:00 pm slot today), and the deep link on a phone.

## Open items
- Cohort 10's week 2 class is on 25 Oct in the Planner (no class 18 Oct); the reminders still go out for 17/18 Oct as asked ("first two weeks"). Change `serviceDays` in `push-reminders` to follow class days if that is not wanted.
- Review fixes: the map link's hook now sits above the early returns on the participant Home (it would have crashed the page while loading); the map opens even if the person's onboarding state is slow or fails (after 2.5 seconds); a null picture from the graphic sheets shows an error instead of dead buttons.
