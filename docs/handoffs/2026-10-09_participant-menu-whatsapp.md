# "Send message" on WhatsApp in the participant menu

## Summary
- My Group → People: the ⋮ menu on a participant now has **Send message** with the WhatsApp icon, after View. It opens a WhatsApp chat
  with that participant ("Hi <first name>, " pre-filled) in WhatsApp or the browser.
- Hidden when the participant has no usable number. It reads the same number the card already shows (copy-number chip), so a number
  hidden from a support stays hidden; nothing new is exposed.
- Frontend only: `components/groups/ParticipantCard.tsx`.

## Live changes
None.

## How it was tested
Browser test with a mocked backend (Support role): link correct for a local number and an international number, item absent for a
participant without a number. `npm run build` passes. Not run against the deployed backend.

## Open items
- Other lists with a participant menu (admin Participants) already have their own WhatsApp actions or none; not changed here.
- The prayer-rhythm and faith-project changes discussed earlier are specced only, nothing built.
