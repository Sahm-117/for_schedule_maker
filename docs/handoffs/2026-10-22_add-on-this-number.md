# Add someone on this number; switch by tapping your picture

## Summary
From the owner's mockups (canvas rows "Add someone on this number" and "A brother or sister on the same guardian number"):
- **Participant:** Profile has **People on this number** (who shares the number, and **Add someone on this number** while it is open). Three steps: who (adult or teenager, name, gender), details (the form's questions: age range or date of birth, email, departments, "What would they like God to do…", and for a teen "I am their parent or guardian and I agree"), check. Then "X is in · Access confirmed" with **Switch to X now** / **Stay as Y**.
- **Switching:** tap your picture at the top: **Switch account** lists everyone on the number (Using now ✓ / Tap to switch to X), plus Add someone on this number. The old "Switch person" items in the sidebar and More menu are gone. The sign-in picker now reads "Who is using the app now? Tap your name."
- **Teen Support:** teen card ⋮ > **Add a brother or sister**: name, gender, date of birth, parent agreed tick; same guardian number and login; result says which Teen Support (or waiting) and gives a WhatsApp line for the parent.
- **Admin:** Settings > **Add someone on this number**: on/off and "until the end of week n's class day" (default on, week 2). Admins get a bell note for each person added.
- FLOW_MAP rule 95 (rule 91 wording updated).

## Live changes
- Migration `20261022150000_add_on_this_number.sql` applied live 2026-10-22: `add_on_number_state`, private `household_add_person`, `participant_add_on_number`, `support_add_sibling`. No AppSetting row written (defaults apply). No edge function.
- Code review follow-up `20261022160000_add_on_number_review_fixes.sql` applied live 2026-10-22: the new person gets any active login on the number (not only the adder's); a date of birth must be 10 to 17 for a teen and 18+ for an adult; new `participant_add_on_number_state` (closed through a teen's own number), which the app now uses. Checked rolled back (sibling of a teen with no login gets the number's login; wrong ages refused; own-number session sees it closed).
- Review fixes in the app: "Switch to X now" remembers the choice; only the right fields are sent for adult/teen; "Stay as" reloads so the picture menu lists the new person; a teen's done screen says Teenager and names their Teen Support; failed switches show a message; no endless loading without a cohort.

## Decisions and why
- Owner: anyone signed in can add (teens too, but a teen needs the parent tick), no admin approval, admin-controlled cut-off week.
- Adults added in the app are ACCESS_CONFIRMED (owner); the person adding is already signed in on that phone, so the number is proven.
- A form record is written first so the form rule (rule 1) and the Follow-ups history still hold.
- The new person gets the number's existing password (rule 91), so no code is sent.

## How it was tested
- Rolled-back live transaction, then again against the live functions (rolled back): state open until week 2's class date; wife added ACCESS_CONFIRMED with the same password, picker shows 2; same name refused; teen without the tick refused, with it TEENAGER + consent + guardian = the adult; admin adds a sister from the teen (TEENAGER, same guardian number, login); picker shows 4; unrelated non-admin support refused; switched off = refused; three linked form records.
- `npm run build` passes; type errors unchanged (7); no new lint errors. Not tested in a browser.

## Open items
- The Google Form route still matches by name and number (see shared-number handoff).
