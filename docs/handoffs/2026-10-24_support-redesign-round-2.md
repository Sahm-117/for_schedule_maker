# Support redesign, round 2 (from the 16-board prototype)

Date: 2026-10-24. Frontend only: no migrations, no functions.

## Shipped
- **Home:** a "Your group meets every week" card first (day and time, "Recording opens 10 minutes before and stays open until midnight", Open my group / Meeting steps). The same row in "Your group" shows only when the card does not (live meeting, or no slot set). Hub-only supports are unchanged.
- **My Group, People tab:** "N of M ready for class" with a bar, a "Open Discussion" button and filter chips Everyone / Not ready / Faith project to write. Uses the same ready rule as everywhere (`participantIsReady`).
- **Attendance:** the "Closes in" chip reads "49 min" or "1 h 5 min" (it showed minutes:seconds, e.g. 974:11); status buttons are 44px tall on a phone; "Mark everyone not yet marked as Present" with a confirm step (FLOW_MAP rule 101).
- **Support Profile:** the "Profile complete" pill is centred.
- Earlier today (same day, other commit): the optional "Any notes?" popup on Mark done and the Android install fallback.

## Not built from the prototype
Remind buttons on the person sheet, the Schedule day strip, hub duty cards by role and a new run-the-meeting flow: the live pages already carry the same pieces (hub role cards, 5/6-step meeting, Today / Tomorrow / Full week chips), so a rebuild was not done.

## Tested
Type check (7 known errors), eslint on changed files, vite build, and a mocked browser (no real support login): Home card, People ready count and Not ready filter, Attendance countdown, confirm and three Present marks, no console errors.

## Addendum (same day, later)
- **Person's "what is left" sheet:** each undone step has a one-tap **Remind** that opens their WhatsApp with a short message for that step (frontend only; nothing is sent until the support presses send in WhatsApp).
- **Schedule day strip:** Sun..Sat pills above the day list, a dot on days with activities, today tinted; tapping a day shows just that day (Today and Tomorrow stay as before; Up next only on Today).
- **My Hub duty cards:** a Recap Lead and/or Prayer Lead gets a card at the top of My Hub ("You lead Review & Recap / Prayer", with the meeting time) and **Open your step** jumps to the Hub meeting tab.
- **Classes:** past-class graphic moved to the right of the row so it lines up with the Next class card.
- **Loaders:** "Open the manual" shows a spinner while the manual downloads (it did nothing on the first tap); "Switching profile…" overlay; "Clearing…" on Clear flag.
- **Resources:** supports' and admin lists newest first (FLOW_MAP rule 102). Participants' list is still A to Z, from `participant_home`; changing it is a migration (not done).
- Tested in a mocked browser: day strip, Remind link, duty cards, Classes layout. The manual spinner was type-checked only (needs a real first-time download).
