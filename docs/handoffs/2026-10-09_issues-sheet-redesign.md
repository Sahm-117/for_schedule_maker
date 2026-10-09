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
- "Closed" now shows only closed issues (before, "Show closed" showed open and closed together).

## Live changes
None. Frontend only.

## How it was tested
Browser test with a mocked backend (Support role): reproduced the covered form before the change, form on top after;
button disabled until text, Open / Closed switch, Log button on the sheet reopens the form. `npm run build` passes.
Not run against the deployed backend or an admin login.

## Open items
- Admin view of the panel (owner picker, Reply) was not seen in a browser; the code path is the same component.
