# Practice: enrol supports who also hold another main role

## Summary
An admin who was given the Support tag (`role = ADMIN`, `roles` contains SUPPORT) could not enter Practice because
`practice_pulse` only enrolled people whose main `role` was SUPPORT. It now enrols anyone with SUPPORT as main role or in
`roles` (same test as FLOW_MAP rule 16). FLOW_MAP rule 39.

## Live changes
- Migration `20261009130000_practice_enrol_dual_role.sql` (applied live): `practice_pulse` enrol condition.
- No edge function.

## Decisions
- Auto-enrol, as asked. There is no visible Practice roster page today; this was checked in the app code.

## How it was tested
Rolled-back SQL test against the live database with a dual-role user: enrolled after the change, not before.

## Open items
- No roster page exists to see who is enrolled; add one only if asked.
