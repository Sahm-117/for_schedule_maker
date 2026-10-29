# Participant onboarding gaps closed

Date: 2026-10-29. Frontend only: no migration, no function. FLOW_MAP rule 113.

## Why
An onboarding audit of `/me/*` was run with a mocked backend. A new participant gets good guidance overall, but the person
not yet placed in a group hit dead ends: "Message support" led to a one-line "You are not in a group yet", and People said
"first in your group". Resources never listed manuals, and the locked "I have all I need" button gave no reason. The
Welcome guide repeated the install steps right after Get the app and showed screens from before the manual-first redesign.

## What changed
- **Not in a group yet**:
  - My Group shows a placement card with "Need help before then?", which opens the Help sheet.
  - Home: the Group call card says "After you're placed in a group", and the intro step says "Opens once you're in a group".
  - People and Profile say they are not in a group yet.
- **Get help**: Home's Message support tile becomes "Get help" whenever there is no support to message (no group, or no
  number on record). The shell passes `openHelp` to pages through `Outlet` context (`participantApp/participantHelp.ts`).
- **Locked ready button**: a line under it explains why:
  - Only the intro is left and it waits on the support.
  - A step opens later (for example, no intro manual yet).
  - Otherwise: tick the steps above.
- **Home title**: "Welcome" before the first class, "Welcome back" after.
- **Resources › Class materials**: lists "Week N manual" for each released manual, opening `/me/week/N?manual=1`, which is
  the Week page's own manual path (illustrated or PDF). Recap documents are listed as before.
- **My Journey with no class weeks**: says "Your journey starts soon" and keeps the prayer streak row.
- **Welcome guide**:
  - It opens at the app tour when the participant comes from Get the app (navigation state `fromAppSetup`).
  - Its screens were updated: Home, the Discussion/Meeting tabs, manual first then reflection, and opt-out cohort prayer with
    the switch on by default.
  - Its URL is now `welcome-to-fof.html?v=2`, because `sw.ts` serves `/guides/` CacheFirst for 60 days.
- **Tours**:
  - New People tour.
  - New no-group step on the My Group tour.
  - The Faith Project tour's dead "Feedback from your support" step is replaced by the edit history step (`pf-history`).
  - Resources tour wording updated.

## Tested
- `npm run build`. `tsc -p tsconfig.app.json` shows only the 7 errors already on `main` (`PracticeDock`, `AdminWebsitePage`).
  eslint on the changed files shows only the existing `react-refresh` error in `TourContext.tsx`.
- Mocked-backend Playwright at 390 wide, 31 checks, no console errors. Scenarios:
  - New participant before class 1 (also with only the intro left).
  - Not in a group.
  - Week 2 with manuals out.
  - Cohort with no weeks.
  - First sign-in through Get the app into the guide.
- /code-review (high): all 10 findings fixed, including the guide cache, Get help covering a group whose support has no
  number, and the streak row kept on an empty Journey.
- Not tried with a real participant login or on desktop width. The "Tick the steps above first." wording only shows once the
  support has introduced themselves, and was not reached in the browser.

## Open items
- Home still moves on to the new week while last week's reflection is unwritten (Journey shows "Write reflection"). This was
  left as designed (`ThisWeekCard` follows the latest class).
- The in-app "App guide" (Help > Open the app guide, `public/guides/app-guide`) was not reviewed for the same staleness.

## Gotchas
- Changing `public/guides/welcome-to-fof.html`? Bump `v` in `WelcomeGuideModal.tsx`, or phones keep the old copy for up to 60 days.
- `useParticipantHelp()` returns null outside the participant shell; the callers fall back to their old behaviour.
