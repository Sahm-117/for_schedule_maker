# Keep an eye on chip explains itself

Date: 2026-10-28. Frontend only: no migration, no function.

## What changed
- On the admin Participants list, the "Keep an eye on" and "Needs attention" chips are now buttons. Tapping one opens a pop-up with **Why** (which Sunday classes and group meetings were missed, by week and how; weeks with no class mark are noted but do not count), **How it is decided** (the programme rules' thresholds) and **Next steps** (named group support, or "no support / not in a group yet"; a teen's steps go through their parent or guardian), plus an "Open profile" button.
- `utils/participantHealthReason.ts` (`buildMissDetails`) mirrors the counting in `evaluateParticipants`; the page keeps the result next to `people` when the cohort loads.

## Tested
- `tsc`, `npm run build`; mocked-backend Playwright at 1280 and 390 wide for a "Keep an eye on" person. "Needs attention" wording is the same component with other steps and was not opened in the browser.

## Review follow-ups
- Weeks before the person was added are not listed as "no class mark". The pop-up opens from an id, so it stays current after a live refresh. The rule sentence omits a threshold set to 0.
- `buildMissDetails` mirrors `evaluateParticipants` rather than sharing its pass; if the counting there changes, change both.

## Open items
- No contact buttons (call or WhatsApp) in the pop-up on purpose: teen numbers are hidden elsewhere (see rule 66). Add them for adults if wanted.
- The Dashboard's "participants to keep an eye on" link opens this list filtered; the chip is the only place with the reason.
