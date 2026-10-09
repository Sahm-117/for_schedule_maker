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

## Also: groups without a support, by gender
The Draft step now says how many new groups have no support, split by the gender of their people ("2 male · 1 female", plus
"mixed" when a group has both or unknown), with chips to show only those groups: All, No support, Male, Female, Mixed. A
chip with nothing in it is hidden. A group stays on screen after it gets a support (the view is a snapshot taken when the chip is picked), the view resets on reopen, rebuild and the planning switch, and it falls back to all groups if none of its groups are left. While a view is on, only its groups can receive "Move here"; pick All groups to move someone into any other group. Frontend only. Tested in the browser
with a mocked cohort (16 people, 1 support): 3 groups without a support, 2 male and 1 female, each chip filters correctly.

## Decisions (mine, not asked)
- Planning drafts cannot be created, because the rule exists so nobody without a working login is grouped.
  If creating from a planning draft should be allowed, that is a separate decision.

## How it was tested
Browser with a mocked backend (16 people, 10 signed in): switch changes Ready to group 10 to 16 and the chip and
text to "Planning only"; Draft shows the banner and a disabled create button; Save draft is not offered.
Not run against a real admin login.

## Open items
- Nothing exports or summarises a planning draft: it is only looked at. Top-up of running groups also uses the wider pool in planning mode (left as is).
