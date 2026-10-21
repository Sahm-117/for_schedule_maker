# Group builder opens on the draft; age filter on the Draft step

## Summary
Groups > Build groups now opens straight on the Draft step. Once it has loaded and the hubs are ready it continues the saved draft if there is one, otherwise it builds a draft with the cohort's saved rules (empty groups are not filled) and shows a note saying so. People and Rules are one Back away; Rebuild applies changes. The Draft step has a new Ages row to show only groups with someone in the chosen age ranges.

## Shipped
- `frontend/src/components/groups/GroupEngineWizard.tsx`: `autoDrafted` ref and an effect that runs once per opening (needs: not loading, hubs ready, still on People). Saved draft: `continueDraft()`. Otherwise `rebuild(rules)` when anyone is ready to group, then the Draft step. Nothing is written; Create is still the only write.
- Ages row (`draftAges`): All ages plus one chip per age range present in the draft, with how many groups have someone in it. Several at once; combined with the gender / no-support view. Empty groups always show. Not saved; reset on open.
- FLOW_MAP rule 43 updated.

## Live changes
- None (frontend only).

## How it was tested
- `npm run build` passes; type errors unchanged (7, Website and Practice files); no new lint errors.
- Not tried in a browser (no admin login or mock here). Check after deploy: open Build groups with and without a saved draft, with empty groups, and with the hubs failing (should stay on People with Try again).

## Open items
- With empty groups, the auto draft leaves them unfilled; the admin picks Fill or Leave on People and Rebuilds.
- A saved draft is continued automatically; the Draft step then shows "This is your saved draft" with "Discard it and start again" (clears the saved draft and rebuilds with the saved rules). Rebuild alone starts again without clearing it.

## Gotchas
- The effect depends on `step === 'people'`; going Back to People later does not rebuild, by design (the ref).
