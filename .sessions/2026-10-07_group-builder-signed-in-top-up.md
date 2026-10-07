# Session: Group builder: signed-in only, top-up, retry fixes

**Date:** 2026-10-07
**Branch:** main

## What Was Done
- **Signed-in only (compulsory):** the builder groups only participants whose login is confirmed (`ParticipantAccount.passwordSetAt` + account on). New read-only `participants_signed_in(cohort)` (staff only, granted to anon like `participants_without_app` because the app sends every request as anon with the session-token header). Others stay Active and ungrouped for a later build. If the check fails, Next and Continue draft are blocked. Started as an optional switch (a965fab), made compulsory at the user's request.
- **Top up existing groups:** `topUpGroups` in `groupingEngine.ts`. Fills running groups that have people and space before new groups: closest ages first, never past largest size, never against gender/age/tag rules; support and existing members untouched. Switch on by default; says "No group to top up" when none has space. Saved drafts keep it; Continue re-checks each addition still fits.
- **Retry fix (live, cd6173b):** Group 1 and Group 2 failed because Cohort 10 had stale labels "Group 1/2 Support" pointing at deleted groups (unique name per cohort), leaving empty groups; Retry then failed on the group name. Now a stale label is adopted (only if the "which groups exist" check worked), and Retry finishes an empty live group with the same support. The reason shows on the failed row.
- **Teen Supports** excluded from the builder's supports (their teen groups are hidden from the builder, so they looked free).
- **Allocation:** removed Auto-distribute evenly (and its code); removed the Group meetings tab (page still linked from dashboard and notifications).
- FLOW_MAP rule 29.

## Verification
- Engine: 11 scenarios (gender, age, full, no gender/age, teen, tag, best fit). Browser (admin, mocked backend): note states, off, none, all full, create step (only added people assigned, no support change), saved drafts, unsigned people never placed, failed check blocks Next, unknown support kept.
- Code review of top-up: fixed support being cleared when unknown, warnings on topped-up cards, saved-draft fit checks, teen hard-code removed, dead `remaining` removed, preview only on step 1.
- Real cohort preview (read-only): 0 signed-in people waiting, 12 groups (max size 3, gender SAME MUST, age SPREAD MUST), 4 with space (Groups 9 to 12, 2 each): nothing to top up tonight.

## Pending Tasks
- Stale labels "Group 1 Support" / "Group 2 Support" in Cohort 10 still point at deleted groups; the new code adopts them when needed.
- Top-up can leave fewer people than the smallest group size for new groups; they show under "Not in a group".
- The Group meetings page has no tab strip now.
