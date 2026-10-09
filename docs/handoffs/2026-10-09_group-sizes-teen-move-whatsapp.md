# Group sizes per gender, admin teen moves, WhatsApp text from the Draft step

## Summary
- Group builder Rules step: size steppers per gender (Female, Male) next to the general size; the engine, caps and group
  checks use them. A Teen Support's teen limit is separate (Settings > Programme rules, per gender). FLOW_MAP rule 41.
- Groups page: an admin can move a teen to another same-gender Teen Support ("Move" on the teen's row). A full support needs
  "Move anyway". The move is logged and both supports are told.
- Draft step: "Text for WhatsApp" builds `Female supports:` / `Name (N participants)` / `Participant, age range` text,
  with a switch for participant names, and a Copy button. Supports can be moved by hand per group. FLOW_MAP rule 42.
- Draft step also shows groups without a support by gender with filters (see the earlier handoff on that).
- Draft step chips also filter all groups by gender (Female / Male / Mixed or unknown), topped-up groups included, not only groups without a support. FLOW_MAP rule 43. The row is hidden when the draft is one gender, every group has a support and no filter is on (nothing to filter); the gender chips are also hidden then. A gender view is live, a no-support view is a snapshot.

## Live changes
- Migration `20261009190000_teen_limit_own_setting.sql` (applied live): `teen_cap_for` no longer reads the group builder's sizes. The teen limit is now
  Settings > Programme rules (general, plus an optional female and male limit; 0 = same as the general one). No live rules had gender sizes saved, so
  nothing changed for anyone.
- Migration `20261009160000_teen_group_sizes_and_admin_move.sql` (applied live): `teen_cap_for`, `assign_teen_contacts`
  (per-gender cap), `admin_teen_move_targets`, `admin_move_teen`.
- No edge function.

## Decisions
- Admin only for teen moves; same-gender Teen Support only (rule 23 still holds).
- The WhatsApp text never carries phone numbers; with names off it lists counts per age range.

## How it was tested
Rolled-back SQL tests for the cap, move, "FULL:" refusal, force and notifications; browser tests (mocked backend) for the
steppers, the move dialog and the WhatsApp panel (names on/off, no digits, copy). Not run against a real admin login.

## Open items
- A saved rule set without `genderSizes` falls back to the general size; nothing to migrate.
- A teen move has no undo button; move them back by the same dialog.
