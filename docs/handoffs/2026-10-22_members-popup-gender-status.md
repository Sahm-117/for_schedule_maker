# Group Members popup: gender, age, status, support's gender first

## Summary
Admins > Groups > a group > Members now shows each participant's gender and age range (small outlined tags) and sign-up status (coloured chip). The list opens on the support's gender (Women / Men / Everyone chips) and hides No Response and Will Join Next Cohort by default (one tap to show them). The subtitle shows the gender split of who is ticked and the support's gender.

## Shipped
- `frontend/src/pages/AdminGroupsPage.tsx` (`MembersModal`): `supportGender` prop (from the group's support, `normaliseGender`); gender / not-joining filters; tags and status chip per row; phone kept on wider screens only. People already ticked always show. FLOW_MAP rule 89.

- Follow-up (same day): adult groups no longer offer teens (10 - 17) unless already a member; an Ages row filters by age range (several at once); the list is sorted readiest first (Access Confirmed, Login Shared, Registered, the rest, not joining). With no support the popup opens on Everyone.

## Fixed after code review
- Teens are hidden only while teen handling is on (`hideTeens` = `teenFlowOn`), as `groupablePeople` does.
- Ages and genders are compared on `normaliseAgeRange` / `normaliseGender` (computed once per person), so "18-24" or "Below 18" match their chips; the row tags show the tidied range.
- The Ages row stays visible while an age is chosen, so it can always be cleared.
- Opening resets the filters once; the support's gender, if it arrives later, sets the view only if the admin has not picked one, and never clears search or ages.
- Gender chip counts follow the age choice.

## Live changes
- None (frontend only). Not pushed at the time of writing.

## How it was tested
- `npm run build` passes; type errors unchanged; no new lint errors.
- Not tried in a browser.

## Open items
- Teens are recognised by age range only. Two participants the owner says are teens are still recorded as 18 - 24, so they still appear until their age range is corrected (owner asked to leave it for now).
