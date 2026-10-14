# Teen Support sees their teens on My Group

## Summary
A Teen Support could not see their people on My Group or Home. The lookup of a support's own groups (`resolveSupportScopedGroups`) skipped teen groups, so the participant list came back empty even though the teens were assigned to them. It now includes the support's own teen group. My Group loads groups with `includeTeenGroups`, so the teen group is selectable and shows Discussion and People. Teen groups still have no Group meetings tab and no onboarding (FLOW_MAP rule 22, text updated).

## Live changes
None. Frontend only: no migration, no function.

## How it was tested
Browser (Playwright, local app) against a **mocked backend**, not the live database: a Teen Support with a teen group of two and another support's adult group. Old code: no teens shown. New code: both teens shown, the adult group's person not shown, no Group meetings tab, no page errors. `npm run build` passes.

## Not tested
A real Teen Support account on live data; Discussion posting for a teen group (the database discussion functions were not checked for teen groups); phone-width layout beyond the mock.

## Open items
- If a Teen Support also leads an adult group, both appear in the group picker (not exercised).
- Home onboarding counts may include teens, who have no onboarding.
