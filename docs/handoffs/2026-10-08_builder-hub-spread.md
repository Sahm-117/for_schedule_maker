# 2026-10-08 · Group builder spreads supports across hubs

Frontend only. No migration, no edge function, nothing live to apply. Local commit, not pushed until
the admin says "push". Read FLOW_MAP.md rule 32 (and 29) with this.

## Summary

The admin asked that the builder fill the groups first, then add supports, picking supports from all
the hubs in proportion so that at least two thirds of the hubs have participants (so every hub has
people to prepare for when the hubs meet, not a few hubs holding all of them).

## What changed

- `frontend/src/utils/groupingEngine.ts`: `HubSpread`, `hubTarget` (ceil of 2/3), `hubCoverage`,
  `hubGroupsNeeded`; `assignSupports` ranks candidates by tag fit, gender fit, then an uncovered hub (until
  2/3 are covered), then the hub with the smaller share of its supports leading, then age fit,
  trainings and name. `topUpGroups` takes `{ hubs, reserveGroups }`.
- `frontend/src/components/groups/GroupEngineWizard.tsx`: loads the cohort's hubs and memberships,
  passes them to the build and the top-up, shows "Hubs with participants: X of Y (aim: at least N)"
  on the Draft step (live as supports are changed by hand), and the hub name in each support's menu.

## Decisions (from the admin)

1. Hubs means the support hubs. 2. When a Must rule stops the 2/3 aim, break the aim, build anyway and
say so. 3. Top-up follows the same aim.

4. (Later) Supports are always in hubs: a support in no hub is not used and is listed as "Not in a hub";
if no hub has anyone in it, the builder asks for hubs to be created and blocks the People step (also if
the hubs fail to load, with Try again).

My own calls, not asked: hub spread outranks a support's age fit but not tag or gender fit; hubs with no
members are not counted; a support in several hubs counts for the first one found; top-up leaves room for one
new group of `minSize` people per hub still needed (never more than the hubs a free support can reach),
counting people who fit no running group, and never holding back people who could not make a group.

## How it was tested

Throwaway engine script (6 hubs, 12 supports): 4 groups reached 4 different hubs (before: 2); 2 groups
gave 2 hubs with the "only 2 groups" reason; with 3 hubs already covered, new groups went to other hubs;
a Must gender conflict built anyway and gave the reason; top-up held back 3 of 4 people. Browser (mocked
network) showed the banner and hub names with no page errors. `npm run build` passes.
Not tested against live data.

## Open items

- Existing running groups' hubs come from their support's hub membership; a running group whose support
  is in no hub does not count towards any hub.
- The banner reason for "a Must rule or not chosen" is generic.

## Gotchas

- `pkill -f vite` kills your own shell; start the dev server with `--strictPort` and stop it by pid.

## Code-review round (same day)

Fixed: reserve could hold back everyone (now counts unplaceable people and caps by what can form a
group); a hub's share used a size that grew as supports were picked (now fixed); a running group whose
support is in no hub was filled first (now last); `hubsLeading` computed once per group; a misplaced
comment. Left as is on purpose: the 2/3 target counts every hub that has members (the admin said "all
hubs"; the banner already explains an unreachable aim); supports the admin put on their own empty groups
stay even if in no hub (their choice); the hard stop with no hubs (the admin asked for it).

## Supports shown by hub (later the same day)

In `GroupEngineWizard` supports are listed under their hub in the People step list, in each group's support
menu (hub headings) and in "Supports without a group"; each group card shows its support's hub as a pill.
No data or database change. Checked in the browser with mocked data (6 hubs, 12 supports).

## Training shows, does not block; Teen Support labels (later the same day)

The builder no longer leaves out supports who missed pre-cohort training: they are used, tagged "Trainings n/total"
in the People list and "Missed training" on their group. The "Also use supports who missed training" switch was
removed (saved drafts still carry the field). The Hubs and Supports pages now show a Teen Support pill
(`TeenSupportPill`, `useTeenSupportIds`). Not rendered: the Supports page change (type-checked and built only).
Noted for later: the Supports page should reflect the activities of each support's group.
