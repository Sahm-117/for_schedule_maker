# Teen meeting link; guardian login message

## Summary
A Teen Support sets a meeting link on the Teen meeting card (My Group), beside the day and time. Guardians and teens see it on their Home and My Group as Join call, like any group. The login message from a teen's card is now addressed to the guardian.

## Shipped (repo only, not pushed)
- `TeenMeetingCard.tsx`: "Meeting link" field in the slot editor; the card shows the saved link or "No meeting link yet"; the button reads "Set time and link" until a time is set.
- `groupsApi.setMeetingSlot`: optional `callLink`; sets `callPlatform` (Google Meet when the link is meet.google.com, else WhatsApp) and still creates no schedule tag.
- `LoginDetailsCard.tsx` (guardian): "Hello, well done on registering <teen> for Foundation Of Faith", says the guardian signs in first and asks them to turn on notifications.
- FLOW_MAP rule 31 updated.

## Live changes
None. Uses existing columns; the Teen Support already writes `Group.meetingDay/meetingTime` from the client the same way.

## How it was tested
`npm run build`. Not seen in a browser.

## Open items
- Check a Teen Support can save the link (same table write as the meeting time) and that it shows as Join call for a guardian.
