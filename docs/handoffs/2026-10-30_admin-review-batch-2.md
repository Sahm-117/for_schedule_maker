# Admin review, batch 2: "This week" on Supports and Group meetings, counts that agree

Date: 2026-10-30. FLOW_MAP rules 126 and 127 (rule 87 updated). The second batch of the admin pages review.

## What changed
- **"This week" card (rule 126)** on Supports and Group meetings (`components/supports/SupportsThisWeek.tsx`). For
  the current class week it lists:
  - groups that haven't marked the meeting done;
  - groups with no meeting day and time;
  - (Supports only) groups with no support.
- **How the card works:**
  - Each name opens WhatsApp with a ready message.
  - "Remind in the app" asks to confirm, then sends one announcement to just those supports.
  - Long lists show 8 names and "+N more".
- **Supports tabs:** the first tab is now "Leading a group 22". The 27 who lead no group are only under "No group".
  The header still reads "49 supports (22 leading a group · 27 not)" unless a search or filter narrows it.
- **Group meetings:** each week tile shows its class date, and weeks whose class hasn't happened say "Not yet"
  instead of 0/23.
- **Counts (rule 127):**
  - `countsAsCohortSupport` is the one definition of a support in a cohort.
  - `cohortsApi.getMembers` now keeps `roles`, so Cohorts says 49, not 44: 5 admins also hold the Support role.
  - Hubs says "48 of 49 supports in a hub".
  - Groups and Cohorts say "23 groups (+5 teen)".
- **Groups:**
  - an amber "N groups are overdue on onboarding · Show them" bar applies the existing Overdue filter;
  - the cards show once groups, people and supports are in, and onboarding, hubs, trainings and tags fill in after.
- **Dashboard:** "What needs you" is at the top once the cohort is running. Before the start, setup still leads
  (rule 115).

## Found on the way
- Support judging counts a week as reported when the support marks the meeting done (`GroupPrayerStatus`, via
  `cohort_health.meetings`). The written report notes (`ParticipantNote` MEETING) the Supports page also loads have
  not been used in 30 days, so "This week" uses the done marks, the same measure as Group meetings.

## Gotchas
- **Groups' split load:**
  - each load has a sequence number, and only the newest one's answers are kept;
  - whichever load is newest ends the spinner, even a background refresh that took over from the first.
  - Without the second part, the page stuck on the spinner when a live refresh arrived during the first load;
    the browser check caught it.
- **Chase wording:** the shared texts live in `components/supports/thisWeekItems.ts`. Change them there, not per
  page.
- **Hubs link:** the Hubs page's "set Operational support" link goes to `/supports?health=nogroup`, because the first
  Supports tab no longer lists supports who lead no group.

## Live changes
None. Frontend only.

## Tested
- In the browser as the test admin (sends blocked in the test), with no errors:
  - Supports: "21 of 22 groups haven't marked their week 2 meeting done", "5 groups have no meeting day and time",
    and the confirm dialog says 21 supports;
  - Group meetings: 22 of 23 (it counts the group with no support too, as its trend does);
  - Cohorts reads 23 groups (+5 teen) and 49 supports;
  - Hubs reads 48 of 49;
  - Groups shows "19 groups are overdue", and Show them sets `?onboarding=overdue`;
  - the Dashboard puts What needs you first;
  - phone width has no sideways scroll.
- `npm run build` passes (type check, tests, build).

## Open items
- The rest of the review comes in later batches: Participants, Attendance, Faith projects, Onboarding, Cohorts
  (Practice/ZZ), Follow-ups, the Engagement and Administration pages.
