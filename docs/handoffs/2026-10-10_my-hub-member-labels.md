# My Hub: group labels no longer overlap member names

## Summary
- On My Hub > Fellow supports, a long group label ("Teens - <a full name>") sat in a no-shrink box on the right, squeezed the name to a sliver and
  ran over it on phones. Each member row is now a small grid with ONE group element: under the name (and its job pills) on phones, in a third column at the right
  from the `sm` breakpoint up, capped at 11rem and wrapping instead of overlapping. The name can wrap too. "No group" is handled the same way and still shows for everyone.
  Frontend only (`SupportMyHubPage.tsx`, small `MemberGroup` helper).

## Live changes
None.

## How it was tested
Browser test with a mocked backend (hub lead; the mock includes a member with no group) at 360, 390, 640, 768 and 1000 px wide using the long names from the report: the
old code reproduced the overlap (measured, and seen in a screenshot); the new code shows no overlap, no overflow and no horizontal page scroll at any width, and exactly
one group link per member who has a group. `npm run build` passed, the type check shows no new errors, and `git diff --check` was clean before each commit.
NOT tested against the deployed backend or with a real hub lead / assistant login (none available here); an assistant without the GROUPS permission sees plain text instead of links.

## Open items
- Other lists that put a long label in a no-shrink box beside a name may have the same fault; none were reported or checked.
