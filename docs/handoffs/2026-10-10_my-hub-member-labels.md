# My Hub: group labels no longer overlap member names

## Summary
- On My Hub > Fellow supports, a long group label ("Teens - <a full name>") sat in a no-shrink box on the right, squeezed the name to a sliver and
  ran over it on phones. On phones the group label now sits under the name and wraps; from the `sm` breakpoint up it stays on the right, in a box
  capped at 40% wide that wraps instead of overlapping. "No group" is handled the same way. Frontend only (`SupportMyHubPage.tsx`, small
  `MemberGroup` helper).

## Live changes
None.

## How it was tested
Browser test with a mocked backend (hub lead) at 360, 390 and 1000 px wide using the long names from the report: the old code reproduced the overlap
(measured, and seen in a screenshot); the new code shows no overlap, no overflow and no horizontal page scroll at all three widths.

## Open items
- Other lists that put a long label in a no-shrink box beside a name may have the same fault; none were reported or checked.
