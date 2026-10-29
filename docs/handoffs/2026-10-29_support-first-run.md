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

## Addendum (same day, before push): per-hint newcomer, sheet waits one launch
Two more rounds of /code-review changed the design.

The first round found that tying the hint to the first launch lost it for good:
- when that launch never reached Home (a first visit through a link, groups failing to load, closing early);
- and admins onboarded under rule 116 would have counted as new again.

The second round found three problems with the "until any hint is dismissed" fix:
- It could block the Get the app sheet forever, for admins who never see the checklist and for supports who never tap "Got it".
- Dismissing one role's hint ended the other role's.
- A key marked before saved progress loaded was lost.

The final design:
- `TourContext.newcomerHint(key)` decides each hint separately. The hint stays across launches until "Got it". The Welcome is not marked as seen on load.
- The Get the app sheet waits only in the launch where a hint first appears (recorded as `<key>:shown`).
- Saved progress is one `{ owner, keys, failed }` state. Keys marked early are folded in when it loads, and `markSeen` never writes into the previous person's progress.
- The support hint waits for the groups to answer, so the cards below do not push it around.

Rechecked:
- Support: new, no group, first visit through a link, reload before "Got it" (the hint stays and the sheet comes back next launch), returning, existing.
- Admin: all scenarios.
- No failures and no console errors.
