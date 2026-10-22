# Supports page says why and adds up; new group names skip archived ones

## Summary
The admin Supports page was confusing while no week had been judged: every card said "Keep an eye on" next to "No weeks to judge yet", the title said 49 supports while the tabs said "All 17", and the onboarding bar counted steps in a way the Groups page does not. It now says why, adds up, and uses the Groups page figure. Separately, "Empty groups" failed with `Group_cohortId_name_key` because an archived "Group 18" still holds its name; new names now skip archived ones.

## Shipped
- `frontend/src/pages/AdminSupportsPage.tsx`:
  - Title "N supports (x leading a group · y not)". Tabs: All N, Needs attention, Keep an eye on, On track, No group y (new `nogroup` filter value, `?health=nogroup`).
  - Status label carries its reason: "· onboarding N days (limit 7)", "· missing weeks 1, 2".
  - Onboarding line "x of y ready" (`participantIsReady`, same as the Groups page), amber only past the limit, "Onboarded" when done; the old `OnboardingBar` (steps where every member is done) is gone, the five step chips stay under Details.
  - Banner before any judged week: "Week 1 records aren't judged yet, so onboarding decides for now: N of M groups aren't fully onboarded."
  - Group line shows the hub too ("Group 13 · Hub 2"); gender and age range as two small outlined tags on that line (the hub line for supports without a group). The old gender/age line and hub name under Details removed.
  - Notes star labelled "★ Notes".
- `frontend/src/components/supports/TrainingPill.tsx`: "Missed n of m trainings" unless all attended ("Trainings m/m").
- `frontend/src/pages/AdminGroupsPage.tsx` + `GroupEngineWizard.tsx`: `takenNames` (every cohort group name, archived and teen included) read before Empty groups and before opening the builder; `nextGroupNames` gets them.
- FLOW_MAP rules 87 and 88.

## Fixed after code review
- Health tabs filter by the support's overall health (weaker group), so the cards match the tab counts; "x of y in this tab" counts supports.
- "onboarding just over 7 days" when the floored day count equals the limit.
- Trainings: only sessions already held count as missed; pending ones show a grey "Trainings a/m".
- Notes buttons keep the bare star (no "Notes ★ Notes"); the label is one constant (`NOTES_PILL`).
- Restored saved drafts rename new groups whose name is now taken.
- Name check failing: Empty groups stops with "Could not check the group names already used"; the builder opens with a warning toast. A mid-loop failure reloads the page and says "Made 2 of 5 groups, then stopped: ...".

## Second review round (22 Oct)
- "x of y ready" now uses `participantFinished` over the group's member count, and an admin "ready" mark counts everyone: the same as the Groups page.
- Trainings: only trainings from an earlier day (Lagos time) count as missed.
- Health tabs no longer include the collapsed "not leading a group" list, so "shown" never exceeds the tab's total.
- The missing-weeks reason only shows when weeks are actually missing.
- Restored drafts rename a new group only when its name belongs to an archived group; a live group of that name is left alone (it may be the draft's own from a run that stopped part way).
- The New group chooser stays up while names are read; a failed read clears stale names and warns.
- Each card's group line also names the support's hub ("Group 13 · Hub 2"); the hub name under Details was removed.
- Left as is: stages and ready counts are two per-group maps built from the same data.

## Live changes
- None. The failed "Make 5" created nothing (Cohort 10 still has 17 active adult groups; checked live). Archived "Group 18" exists, so the next empty group will be "Group 19".

## How it was tested
- `npm run build` passes; type errors unchanged (7, Website and Practice files); no new lint errors.
- Not tried in a browser.

## Open items
- The builder's "Make a group for each" and new-group names use `takenNames` read when the builder opens; a group archived while it is open is not seen until it is reopened.
