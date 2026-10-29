# Support first run: one Start here hint

Date: 2026-10-29. Frontend only: no migration, no function. FLOW_MAP rule 117 (rule 116 updated).

## Why
This was the open item from the admin first-run work: a support's first visit still stacked the Welcome, a 5-step tour and the notifications banner. The flow-onboarding guide says to teach one thing in place, not to run a tour on first load.

## What changed
- **No Welcome or auto-tour for supports.** Their first visit is recorded as the welcome launch: the Get the app sheet waits for the next launch, and Home shows one "Start here" hint until "Got it".
- **`components/tour/StartHereHint` is shared with the admin Dashboard.** It only shows in a first-visit launch, so existing supports and admins never see it. It also stays hidden when saved progress fails to load, or belongs to the previous person on a shared device.
- **`TourContext`:**
  - It now knows whose progress it holds (`seenFor`).
  - It works out "first visit" once and uses it for both the Welcome and the hint.
  - `welcomedThisLaunch` is worked out in the same render, so the sheet cannot slip in before it.
- **Unchanged:** supports still see the notifications banner from day one. Schedule preparers and team members keep the Welcome.

## Tested
- `npm run build`. `tsc` shows only the 7 errors already on `main`, and eslint has no new problems.
- Mocked-backend Playwright, 20 support checks at 390 wide. Scenarios:
  - new support with a group
  - new support with no group
  - returning support who dismissed the hint
  - existing support who saw the Welcome long ago
- The admin checks (empty, set-up, first run, started) were rerun. No console errors anywhere.
- /code-review (high): 9 of 10 findings fixed. The tenth is left as is: a required hub-intro pop-up may now open on a hub support's first visit. It is the only full-screen item then, so it still keeps to one thing at a time.
- Not tried with a real login.

## Open items
- `WELCOME.support` in `constants/tours.ts` is now never shown. It is kept because the Welcome type needs an entry per audience.
- `SupportOnboardingPage.tsx` is unused (`/support/onboarding` redirects to My Group). Removing it needs the owner's OK.
- The participant Help → App guide has not been checked for out-of-date screens.
