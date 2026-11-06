# Group gender match, gender and age everywhere, teens from Participants

Date: 2026-11-06.

## Summary

The owner asked for three things: assign a teen from the Participants page; see every person's gender and age range
on Allocation, and every support's gender and age; and, when adding someone to a group, only see groups of their
gender. Decisions on the follow-up questions: no group is mixed today, but if one is later it is shown to everyone;
add a "Show all groups" switch for the rare exception; teens always go through a Teen Support; enforce it on the
server too.

- **Server rule (FLOW_MAP rule 135).** A person joins only a group of their own gender. A group's gender is its
  members' gender, or its support's when it is empty; a group with both, or with anyone placed on purpose, is Mixed.
  An admin can place someone in a group of the other gender on purpose ("Show all groups"); the database records
  when and which admin. App screens can never put a teen on the teen path into an adult group.
- **Participants.** "Assign to group" lists only same-gender groups, each with its support's gender and age and its
  size, plus "Show all groups" (an amber warning shows before saving an other-gender pick). For a teen on the teen
  path the menu item, the "Not in a group" list button and the side panel say "Choose a Teen Support" and open the
  Teen Support picker (same-gender Teen Supports, their gender and age, "4 of 4 · full", "Move anyway").
- **Allocation.** Every person shows gender and age tags (and "Teen"); every group card shows Women / Men / Mixed and
  its support's gender and age on its own line. Dragging greys out other-gender groups and they refuse the drop
  unless "Show all groups" is on. "Move selected" offers only groups that fit. The phone sheet uses the same picker
  as Participants. Teen groups are shown read-only, so teens in them no longer look unassigned; tapping a teen opens
  the Teen Support picker.
- **Groups members picker and group builder.** The members picker warns when people of the other gender are ticked
  and saves them as on purpose. The builder saves a genuinely mixed group (or one with a support of the other
  gender) as on purpose; one-gender groups are checked as usual. Saving a group's members again keeps its
  on-purpose rows.

## Live changes

- Migration `supabase/migrations/20261106100000_group_gender_guard.sql`:
  - `GroupParticipant."genderOverrideAt"`, `"genderOverrideById"` (new columns);
  - `fof_gender`, `group_gender_of` (owner only), `group_member_gender_check` (definer), trigger function
    `group_member_gender_guard` (runs as the caller, so it can tell an app write from a database function) and the
    trigger on `GroupParticipant`.
- **Applied live on 6 Nov 2026**, then re-applied the same day with two hardening changes found in review (the check
  does nothing without a staff session, so an error can never reveal a person to an outsider; `group_gender_of` is
  no longer callable with the public key). Checked afterwards: both columns, the trigger, the grants, no existing
  row changed.
- No edge function changed.

## How it was tested

- Rolled-back transactions against live data (nothing kept): man into a women's group refused; woman into an empty
  group with a male support refused; same gender, no gender, override, mixed group, move by update, many-row insert
  (second row sees the first), re-saving a mixed group in any order, no session (refused by the table's access
  rule), a support (not admin) overriding (refused), the check called directly without a session (silent), a teen
  into an adult group (refused, even with override), and database-owner inserts (not checked).
- Before applying: the current cohort had no mixed group and no group whose support's gender differed from its
  members.
- Unit tests: `src/utils/__tests__/groupGender.test.ts` (7). `npm run build` passes.
- Playwright as the test admin against the local app and the live backend, every write intercepted (no real person
  was moved): Allocation tags, group badges and support lines; 9 men's groups greyed out while dragging a woman; the
  phone sheet showing women's groups only, then all with men's marked; Participants "Assign to group" women only,
  "Show all groups", the warning, and the saved row carrying `genderOverrideAt`; a teen's "Choose a Teen Support"
  opening the picker with the support's gender and age. No console errors. The temporary test session was deleted.

## Open items

- None from this work. A person with no gender on file sees every group; adding gender to those profiles makes the
  filter work for them.

## Gotchas

- The rule only checks writes made as `anon` / `authenticated` (the app). A new database function that adds group
  members runs as the owner and is not checked; apply the rule yourself there if it should be.
- Any row with `genderOverrideAt` makes its group Mixed, so stamp only the people who really differ
  (`bulkAssign({ overrideIds })`, `setParticipants({ overrideIds })`), never a whole batch of matching people.
- `moveParticipant`, `bulkAssign` and `setParticipants` delete then insert; if the insert is refused they put the old
  rows back and throw a plain-words message (`groupMoveMessage`).
- dnd-kit marks a non-draggable chip `aria-disabled`; teen chips override it because they are still tapped.

## How to pick this up

Start from `utils/groupGender.ts` (mirrors `group_gender_of`) and `components/groups/GroupPickList.tsx`. The
database side is one migration; FLOW_MAP rule 135 lists every screen involved.
