# Groups page: onboarding status at a glance, and the support's hub

## Summary
- Each adult group card on the Groups page now shows how far its onboarding is, without opening anything: a status chip (**Not started / In progress / Overdue / Onboarded**), a "x of y onboarded - day n of 7" line,
  five segments (Intro, Map, Guide, Profile, Ready) each filled by the share of members past that step, and "Waiting on <step> - n people" (the step with the most people still to do).
  Overdue = not onboarded and more than the programme's `onboardingMaxDays` (7) since the group's support was last assigned (the Supports page counts from the same event).
- A summary row above the filters ("Onboarding: Overdue 1, In progress 1, Not started 1, Onboarded 1") with tappable counts, and an "Onboarding" filter (`?onboarding=overdue`) in the filter sheet.
- The support's **hub name** now follows the support's name on every card, adult and teen ("Support 1 - Lekki Hub"); a support in no hub shows just their name.
- Teen groups and empty groups show no strip (teens have no onboarding, FLOW_MAP rule 22). If the onboarding data cannot be loaded the strip, summary row and filter are hidden and the page works as before.
- New in code: `utils/groupOnboarding.ts` (the roll-up), `components/groups/GroupOnboardingStrip.tsx`, `groupsApi.getAssignedDates` (one small read of `GROUP_ASSIGNED` events). The page loads three more small things (onboarding
  progress, assigned dates, hubs and memberships), once per load, no polling. FLOW_MAP rule 53.

## Code-review fixes (same change)
- Overdue now uses exact (fractional) days like the Supports page and the dashboard (7.5 days = Overdue; exactly 7.0 is not); the card shows whole days ("just over 7 days since assigned").
- A group with no support never shows Overdue or a day count (the old assignment event no longer counts).
- A stale `?onboarding=...` link is ignored when there is no onboarding data, instead of emptying the page.
- The assigned dates are fetched in parallel with the rest (not after it), and a failed background refresh keeps what the page had; only a first load clears it. If just the dates fail the summary row says "Day counts unavailable, so Overdue can't be shown".
- Summary pills add or remove only their own choice (multi-select kept); counts are computed once. Step bars no longer round a nearly-done step up to full, and each step has a tooltip with its count.
- Not done: telling a late finish from an on-time one (needs `GroupOnboardingStatus.completedAt`, not loaded here) and a unit-test file (the project has no test runner; the roll-up rules were checked with a throwaway script, 12 cases, all passing).

## Live changes
None. Frontend only; no migration, no function deployed.

## How it was tested
Browser test with a mocked backend (admin, 5 adult groups in each state plus an empty group, a teen group, two hubs) on desktop and at 390 px: each card shows the right chip, count, day line, segments and waiting line
(the numbers match the mock data by hand), plus the review cases: stale filter link with no data, failed dates, multi-select, a group with no support, a group 7.5 days in; the summary row counts are right; tapping Overdue filters to one group and the address gets `?onboarding=overdue`, tapping again clears it; the teen card has no strip and shows its hub;
no horizontal scroll, no page errors; with the onboarding call failing the cards show no strip and nothing breaks. Screenshots checked by eye. `npm run build` passed, the type check shows only the 27 old errors, `git diff --check` clean.
NOT tested against the deployed backend or with real data, so the real numbers (and how many groups end up Overdue) are unchecked.

## Open items
- A support in no hub shows no hub text (nothing says "No hub"). Say if you want that spelled out.
- The Supports page keeps its own all-or-nothing strip; it was not changed. It could use the same partial-fill strip.
- Member rows on the card do not show per-person steps (idea 4 from the proposal), only the group roll-up.
