# Group builder: "Planning only" switch

Frontend only. No migration, no edge function, nothing live to apply. Read FLOW_MAP rule 29 with this.

## Summary
The People step of the group builder had "Only people who have signed in" as a fixed Required rule. It now has a
"Planning only" switch (off by default). On, the draft includes everyone ungrouped, signed in or not, so the admin
can forecast how many groups and supports a cohort needs. A planning draft can be saved and looked at, but not
created: the Draft step shows a banner, its create button reads "Planning only" and is disabled, and `create()` refuses.

## Changes
- `GroupEngineWizard.tsx`: `planningMode` state and switch; pool is everyone ungrouped when on; Next no longer waits
  for the sign-in check in planning mode; Continue draft restores the mode the draft was saved with; saves
  `planning` and `onlySignedIn: false`.
- `groupingEngine.ts`: `planning` on the saved draft shape (older drafts read as not planning).

## Decisions (mine, not asked)
- Planning drafts cannot be created, because the rule exists so nobody without a working login is grouped.
  If creating from a planning draft should be allowed, that is a separate decision.

## How it was tested
Browser with a mocked backend (16 people, 10 signed in): switch changes Ready to group 10 to 16 and the chip and
text to "Planning only"; Draft shows the banner and a disabled create button; Save draft sends `planning: true`.
Not run against a real admin login.

## Open items
- Nothing exports or summarises a planning draft beyond looking at it and saving it.
