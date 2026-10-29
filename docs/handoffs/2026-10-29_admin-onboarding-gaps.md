# Admin onboarding gaps closed

Date: 2026-10-29. Frontend only: no migration, no function. FLOW_MAP rule 115.

## Why
An onboarding audit of the admin pages (mocked backend, a brand-new cohort 3 days before class 1) found several problems:
- The Dashboard said "Nothing needs you right now" with green ticks on empty registration numbers, while groups, supports, hubs, the prayer start and scriptures were all still to set up.
- The existing "Ready to start?" list sat at the bottom.
- The Welcome said "V2".
- A few empty states and subtitles were stale or misleading.

## What changed
- **Dashboard (upcoming cohort):**
  - "Get <cohort> ready" right under the cohort strip, with a "x of y done" count.
  - Three new items (hubs, corporate prayer start week, daily scriptures) join the earlier seven: weeks, schedule, mobilisation target, participants, groups, supports, everyone placed.
  - Each item ticks itself and has an Open link. Items whose data failed to load are left off.
- **Dashboard header and Needs attention:** the header counts setup steps left. Needs attention says "Nothing else needs you" while setup is open.
- **Registration cards** (Dashboard and Follow-ups): grey "Nothing yet" instead of green ticks while nobody is registered.
- **Planner "Right now":** says "<cohort> · Getting ready" before class 1 (it said "Class 1 of 10").
- **Welcome:** "Welcome to FOF Ops", and the tiles no longer say "now".
- **Dashboard tour** (6 steps for an upcoming cohort):
  1. Cohort strip
  2. Start here (the checklist)
  3. Vital signs
  4. What needs you
  5. The back office
  6. Help
- **Wording:**
  - Feedback points to the Surveys page.
  - The Announcements subtitle covers supports, participants or everyone.
  - Faith projects: "No participants in this cohort yet" (only after a successful load).
  - Supports explains how supports join.
  - Start attendance is disabled when the loaded cohort has nobody.

## Tested
- `npm run build`. `tsc` shows only the 7 errors already on `main`, and eslint has no new problems.
- Mocked-backend Playwright at 1280 wide, 16 checks, no console errors. Scenarios:
  - Empty cohort.
  - Fully set-up cohort (10 of 10).
  - First sign-in: Welcome and tour.
- /code-review (high), all 10 findings addressed:
  - Scriptures are shared by design, now noted.
  - A failed target read is treated as unknown.
  - The extras reset on cohort change and no longer reload on every live update.
  - Plurals.
  - Tour order.
  - Load failures no longer read as an empty cohort.
- Not tried with a real admin login or on mobile.

## Open items
- Admins who already finished the Dashboard tour will not see the new "Start here" step unless they tap "?".
- Scripture designs are global, so "Daily scriptures uploaded" ticks for every cohort once any design exists.
