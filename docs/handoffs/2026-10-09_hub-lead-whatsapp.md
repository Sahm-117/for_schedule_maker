# Hub leads can WhatsApp a participant from the group overview

## Summary
- The group overview a hub lead opens from a support's group now has **Send message** (WhatsApp icon) in each participant's expanded
  row, opening a chat with "Hi <first name>, " pre-filled. It was asked for after the same item went onto the My Group participant
  menu (separate handoff, `2026-10-09_participant-menu-whatsapp.md`).
- Teens are excluded: their number is never sent to the browser; the row shows "A teen's number stays with their Teen Support."
- FLOW_MAP rule 48. New shared `components/WhatsAppIcon.tsx`, used by both new spots.

## Live changes
Migration (applied live):
- `20261009200000_hub_group_overview_numbers.sql`: `hub_group_overview(uuid)` rewritten from its live definition with two added fields per
  participant, `isTeen` and `phone` (NULL for a teen). Same access check (`discussion_staff_access`); nothing else changed.

## Decisions and why
- Teen test = teen group OR age range "10 - 17" OR contact on the teen path, so a teen sitting in a normal group is hidden too.
- Everyone who may open the overview (hub lead, assistant with "See groups", the group's support, admin) gets the numbers; they could
  already see the people, and the support has the numbers on My Group anyway.

## How it was tested
Rolled-back SQL as an admin session: a teen group returned 3 teens and no numbers; a normal group returned 3 numbers; marking one
participant "10 - 17" hid that number; a call without a session is refused. Browser test with a mocked backend (hub lead): link
correct for an adult, none without a number, teen note for a teen. `npm run build` passes. Not run with a real hub lead login.

## Open items
- Other lists that show participants to staff (admin lists, hub prayer list) were not changed.
