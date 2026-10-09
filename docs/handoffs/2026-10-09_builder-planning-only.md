# Group builder: "Planning only" switch

Frontend only. No migration, no edge function, nothing live to apply. Read FLOW_MAP rule 29 with this.

## Summary
The People step of the group builder had "Only people who have signed in" as a fixed Required rule. It now has a
"Planning only" switch (off by default). On, the draft includes everyone ungrouped, signed in or not, so the admin
can forecast how many groups and supports a cohort needs. A planning draft is only a view: it cannot be saved (that would overwrite the
cohort's one saved real draft) or created. The Draft step shows a banner, its create button reads "Planning only" and
is disabled, and `create()` also refuses unless everyone in the draft has a confirmed sign-in. Toggling the switch clears the draft.

## Changes
- `GroupEngineWizard.tsx`: `planningMode` state and switch; pool is everyone ungrouped when on; Next no longer waits
  for the sign-in check in planning mode; Save draft is hidden in planning mode.
- The switch resets to off each time the builder opens.

## Decisions (mine, not asked)
- Planning drafts cannot be created, because the rule exists so nobody without a working login is grouped.
  If creating from a planning draft should be allowed, that is a separate decision.

## How it was tested
Browser with a mocked backend (16 people, 10 signed in): switch changes Ready to group 10 to 16 and the chip and
text to "Planning only"; Draft shows the banner and a disabled create button; Save draft is not offered.
Not run against a real admin login.

## Open items
- Nothing exports or summarises a planning draft: it is only looked at. Top-up of running groups also uses the wider pool in planning mode (left as is).
