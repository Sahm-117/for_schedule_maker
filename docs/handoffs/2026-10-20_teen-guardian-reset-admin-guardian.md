# Teen Support can reset the guardian's password; admin shows the guardian

## Summary
A Teen Support can now create a new login code for a teen's guardian at any time from the teen's card (My Group > People > Details), not only before the guardian has signed in. Admin screens now say which number and name are the guardian's.

## Shipped (repo only, not pushed)
- `ParticipantCard.tsx`: the login card shows in a teen's Details whatever the sign-in state (it was hidden once the guardian had signed in, which removed the reset).
- `LoginDetailsCard.tsx`: `guardian` prop, with "Guardian login details", "Guardian forgot the password? Create a new code" and a warning that the guardian and the teen are signed out.
- Admin Participants list (table and phone cards): a teen's number is marked as the guardian's. Admin participant profile: teens show "Parent or guardian" (name) and "Guardian's number" instead of "Phone". Admin Groups teen rows: "Guardian <number>".
- FLOW_MAP rule 67 updated.

## Live changes
None. No database change: `participant_login_details` already lets the support who holds the participant (or owns the contact) create a new code.

## Decisions and why
- A new code replaces the family's password for that account and deletes its sessions, so the guardian and the teen's own number are signed out. The card warns before it does it.
- A teen's `Participant.phone` is the guardian's number (rule 67), so admin labels follow that.

## How it was tested
`npm run build`. Not seen in a browser and not tried with a real Teen Support account.

## Open items
- Try the reset as a Teen Support on a guardian who has signed in, and again for a guardian number that carries two teens (each teen row has its own account row; check the new code works for the guardian to sign in).
- The message the card sends opens with the teen's first name ("Hello <teen>") although it goes to the guardian's number; reword if that reads oddly.
