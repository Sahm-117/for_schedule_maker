# Group builder: groups without a support, by gender

Frontend only. No migration, no edge function. Read FLOW_MAP rule 29 with this.

## Summary
The Draft step says how many new groups have no support, split by the gender of their people ("2 male · 1 female", plus
"mixed or unknown" when a group has both or none on file), with chips to show only those groups: All groups, No support, Male,
Female, Mixed or unknown. A chip with nothing in it is hidden unless it is the active one.

## Behaviour
- A view is a snapshot of the groups it matched when the chip was picked, so a group stays on screen after it is given a support
  and the cards do not jump. Picking a chip again refreshes it. The chip row stays while a view is active, so "All groups" is
  always there to get back.
- The view resets on reopen, rebuild, continue draft and the Planning only switch, and falls back to all groups if none of its
  groups are left.
- While a view is on, only its groups can receive "Move here"; pick All groups to move someone into any other group.
- "All groups" counts every group in the draft, empty ones too (they are shown on screen); the header counts only groups that
  will be created.

## How it was tested
Browser with a mocked cohort (16 people, 1 support): 3 groups without a support, 2 male and 1 female; each chip filters
correctly and All groups returns the full list. Not run against a real admin login.

## Open items
- None.
