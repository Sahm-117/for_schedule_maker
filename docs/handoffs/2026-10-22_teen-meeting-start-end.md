# Teen meeting: Start meeting / End meeting, pencils, Teens tab

## Summary
From the owner's canvas comments ("Teens not people", no "record meeting", "pencil instead of change"):
- My Group, teen meeting card: the meeting time has a pencil to edit (or "Set time and link" when none).
- While recording is open (10 minutes before the call until midnight), the button is **Start meeting**: "Meeting started · <time>", Who's here? (Joined / Excused / Missed) and notes, then **End meeting** saves (same save as "We met" before, day = today; admins told on the first save as before). Before the window opens no button shows; the existing window notice explains when it opens.
- A saved meeting reads "Meeting ended · <day>" with a pencil to edit (the day field shows only when editing an ended meeting).
- A teen group's People tab reads **Teens**, and the count says "4 teens".
- The Teen Support's questions card (teen questions handoff) also sits under the meeting card on My Group.
- FLOW_MAP rule 93.

## Live changes
None. Frontend only.

## How it was tested
`npm run build` passes; type errors unchanged (7); no new lint errors. Not tested in a browser.

## Open items
- The start time shown is the moment Start meeting was tapped on that phone; it is not stored.
- "Joined" kept as the label (the canvas used "Here"; owner to decide).
