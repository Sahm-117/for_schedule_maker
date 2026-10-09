# Issues: "Log issue" did nothing from a contact; sheet and form redesigned

## Summary
- **Bug:** "Log an issue" on a follow-up contact opens the Issues sheet with the log form already open. The form sat
  *behind* the sheet (inner portal attached first), so it was invisible, and tapping "Log issue" changed nothing.
  `ModalShell` has a new `stacked` prop (layer above other modals); the log form and the resolve/delete confirmations in
  `FollowUpIssuesPanel` use it.
- **Redesign** (same props, so the Support Mobilisation, Support Follow-ups and Admin Follow-ups pages are unchanged):
  one "Log an issue" button, an Open / Closed switch (Open shows the count), the duplicate "Issues & questions" heading
  removed, plain cards with Reply / Mark resolved / Reopen in view and Delete in the menu, a friendly empty state.
  The form asks "What is happening?" first, then "Who is it about?" (optional); owner and needed-from sit behind one
  "Add ..." row. The Log button stays off until something is typed.
- After /code-review: a failed Reply / Resolve / Reopen / Delete now shows its error at the top of the sheet (before, it
  failed silently); a cancelled log form clears its old error; the Resolve and Delete modals match the new style; the
  Open / Closed switch is a plain toggle group; the in-app guide line that mentioned "Show closed" is updated.
- "Closed" now shows only closed issues (before, "Show closed" showed open and closed together).

## Live changes
None. Frontend only.

## How it was tested
Browser test with a mocked backend (Support role): reproduced the covered form before the change, form on top after;
button disabled until text, Open / Closed switch, Log button on the sheet reopens the form. `npm run build` passes.
Also checked as a mocked Admin on the Follow-ups Issues tab: Reply box, owner picker above the form, and the error
shown when Resolve fails. Not run against the deployed backend or a real admin login.

## Open items
- Other popups in the app use their own layers (z-70, 120 to 140); `stacked` is a single step above normal modals, not
  a general stacking system. A modal that opens from inside another one still needs `stacked`.
