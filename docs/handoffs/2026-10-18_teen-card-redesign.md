# Teen card redesign (My Group > People)

## Summary
A teen's card is now a short summary: name and Ready / Not ready, WhatsApp and the ⋮ menu, then three facts (last login, device, guardian number Added / Not added), one "Next step" line, and a Details button. Everything else sits under Details. Approved design: the "Teen card redesign" canvas.

## Shipped
- `ParticipantCard.tsx`: teen layout (age range 10 - 17); adults keep the old card.
- One alert at a time: an unanswered help request hides the next step and the faith-help box; a flagged concern shows as a single "Needs attention" line that opens the existing flag note.
- Next step: guardian not signed in yet, "Send the guardian their login details…"; otherwise the first unfinished participant step ("Help them finish: Intro").
- Details holds: the chips (faith project, reflected, alerts, not opened), the teen's own number (optional), the onboarding steps, All details, any shared testimony, and the guardian login card (shown until the guardian has chosen a password).

## Live changes
None. Frontend only.

## Decisions and why
- Guardian number comes from `Participant.guardianPhone`.
- The login card reuses `LoginDetailsCard` with the participant id (as on the admin profile). The database says supports may only see login details for their own participants; not checked against a real Teen Support account.

## How it was tested
`npm run build` and the type check. Not seen in a browser (no login to the live backend here); please look at a teen card on a phone.

## Open items
- Confirm a Teen Support can open the guardian login card and send it.
- "Last login" uses the app's last-seen time, not a separate login timestamp.
