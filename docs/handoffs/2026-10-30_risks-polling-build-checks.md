# Risks worked on: Sunday polling, type check and tests in the build, primer updated

Date: 2026-10-30. FLOW_MAP rules 124 and 125. Follows the primer's "What could hurt the programme" list.

## What changed
- **Sunday-morning polling (rule 124).** From 7 am to 2 pm Lagos on Sundays, background checks that opt in
  (`sundaySlow`) wait twice as long:
  - the bells and the Community dot;
  - the update check and the nudge card;
  - discussions and their unread dots;
  - Practice's background beat.

  Participant Home, the meeting-live check, the Attendance pages, clocks and the corporate prayer signal keep their
  pace. The prayer signal was in the slowed list at first; it was taken out on 31 Oct because it opens the "prayer
  is live" pop-up.
- **The build checks itself (rule 125).**
  - `npm run build` is now `tsc -b && vitest run && vite build`, and `npm test` runs the tests alone.
  - Vitest 3.2.4 added as a dev dependency. The tests are in `src/utils/__tests__/rules.test.ts`: 12 tests on
    Sunday marks, completion, health, the Right now line, rest weeks and Sunday polling.
  - A deliberate break (Late counted as a miss) fails 3 of them.
- **The 7 old type errors are fixed:**
  - the How it works card editor's text boxes now show their placeholders;
  - the card's icon type;
  - an unused tab short label;
  - a null check in `PracticeDock`: when a walkthrough has ended, the participant's dock now clears the partner
    (it used to keep showing them).
- **Handover primer (`sites/project-primer`):**
  - "What's new" has 12 cards, including today's work.
  - Each risk now says what was done and what is left: two are marked Done, one Medium (re-check Sunday 1 Nov), the
    rest Watch.
  - The "screens" lane says the build runs the type check and tests.

## What the numbers showed (live, 30 Oct)
- The live-update feed's database check has not run since the notifications table came off it. Its call count is
  frozen at 5,293,201.
- On a quiet database:
  - participant Home takes about 9 ms (the 178 ms average comes from stalls);
  - the practice beat in the background, about 2 ms (46 ms with auto-ticking, only while in Practice);
  - the prayer signal and the hubs reads, under 2 ms.
- The web-request queue runs at about 13 requests an hour. Only 10 people have Telegram on, so a broadcast makes at
  most 10 Telegram requests.
- Practice is on for all 47 supports, but only one used it in the last day. Switching it off is the owner's call.

## Live changes
None. Frontend, tests and the primer only.

## Tested
- `npm run build` passes (type check, then 12 tests, then build, about 48 s). Lint is clean on the changed files.
- Primer checked at phone and desktop width, light and dark: no sideways scroll, no console errors.

## Open items
- Re-check the database numbers after Sunday 1 November. If it still stalls, the free path is a self-hosted Supabase
  on Oracle Cloud Always Free (from the research), which is a project of its own.
- The tests don't cover database functions, and older `any` lint errors remain.

## Gotchas
- Never give `sundaySlow` to a clock or to a check that tells someone something has opened.
- `npm run build-with-types` now just runs `npm run build`.
- Vercel installs dev dependencies, which the build needs for `tsc` and `vitest`. Don't set
  `NODE_ENV=production` for the install.
