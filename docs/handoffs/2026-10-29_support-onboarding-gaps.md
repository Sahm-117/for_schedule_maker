# Support onboarding gaps closed

Date: 2026-10-29. Frontend only: no migration, no function. FLOW_MAP rule 114. Rule 113 now points at the shared helper.

## Why
An onboarding audit of `/support/*` (mocked backend) found several problems for a brand-new support:
- A support with no group and no hub was sent from My Group to My Hub, which then said "not in a hub".
- Home showed group rows ("Next group meeting: Not set") for someone with no group.
- The profile card claimed an incomplete profile was "delaying mobilisation" even when only the photo was missing.
- The Welcome said "V2", and the Home tour had 7 steps and skipped "Get your group ready".
- The Get the app sheet opened straight after the tour.
- Home said "No activities are assigned to your tags".

## What changed
- **Not placed yet**: `components/supports/NoGroupCard` on My Group says "You'll be given a group soon", with **Need help?**.
  Hub-only supports, or anyone whose hub has not loaded, still get "Open My Hub". Home's Your group card says they are not in a
  group yet. `AppDataContext.myHubLoaded` says when `get_my_hub` has answered.
- **Home groups**: they are `null` until loaded, and a failed refresh keeps the last list, so "not in a group" never shows for
  someone who has one.
- **Help helper**: `components/participantApp/participantHelp.ts` became `components/shellHelp.ts` (`useShellHelp`). Both
  shells now pass `openHelp` through `Outlet` context.
- **Get your group ready, empty group**: the participants step says "Once people are added to your group, you'll see who's
  ready here."
- **Profile card**: "Every support needs a complete profile. Please finish yours." (asked for by the owner).
- **Home header**: "Welcome" / "<cohort> starts soon" before the start date.
- **Welcome and tours**:
  - The Welcome is "Welcome to FOF".
  - The Home tour has 5 steps: Start here (Get your group ready), Next class (mentions Mark attendance), Today, Find your way
    around, Help.
  - The My Group tour starts with a no-group step, and its tabs step is now optional.
- **Get the app sheet**: waits for the next launch after the Welcome (`TourContext.welcomedThisLaunch`, reset when the
  person changes). The Home banner still asks.
- **Empty states**:
  - Schedule: "No activities are assigned to you yet…" instead of the "tags" wording.
  - Resources (non-admins): "Guides and files from the FOF team will appear here."
  - My Hub explains that the FOF team adds you to a hub.

## Tested
- `npm run build`. `tsc` shows only the 7 errors already on `main`. eslint shows only existing errors (`useAppData` and
  `useTourState` exports, an `AppShell` useMemo warning).
- Mocked-backend Playwright at 390 wide, 15 checks, no console errors. Scenarios:
  - New support with an empty group.
  - No group and no hub.
  - Hub-only.
  - First sign-in: Welcome, 5-step tour, no sheet afterwards.
- The participant no-group Help button still opens the sheet after the helper was renamed.
- /code-review (high): 10 findings, all addressed. The `SupportOnboardingPage` finding is moot because that page is unused
  (`/support/onboarding` redirects to My Group), so the edit to it was reverted.
- Not tried with a real support login or at desktop width.

## Open items
- `SupportOnboardingPage.tsx` is not routed or imported anywhere. Ask the owner before removing it.
- The admin Welcome still says "Welcome to V2".

## Gotchas
- `useShellHelp()` returns null outside a shell. `NoGroupCard` then hides its button.
