# Teen questions for the joint Q&A

## Summary
From the 17 Oct Teen Supports meeting: teens' questions are collected (by the teen, or typed by their Teen Support for a teen with no phone or no guardian there) and taken first at the joint Q&A upstairs.
- **Teen Support:** a "Questions for the joint Q&A" card on Home and on Classes (Teen Supports only). Add a question → pick one of their teens → class (next class by default, any week) → the question in the teen's words → "Hide their name" (on by default) → Send, or "Send and add another". The card lists that class's questions from their teens with a pencil on the ones they typed (until marked for class or replied to).
- **Admin, Feedback > Questions:** a Teen tag, a "Teens first" switch (on by default, with a count), and "A teen asked" when the name is hidden (the real name and group stay in the small line under it, for replying).
- **Teen's Week page:** "Ask a question" shows even before the manual is out (adults still need the manual); a question their support added reads "Sent by <support's first name> for you".
- The support's Classes page question rows say "Added by …" and "name hidden at the Q&A".
- FLOW_MAP rule 90.

## Live changes
- Migration `20261022100000_teen_questions.sql` applied live on 2026-10-22 (Management API): `ManualQuestion."askedById"`, `"hideName"`; `ask_manual_question` (teen names hidden by default), new `support_ask_manual_question`, `support_update_manual_question`, `list_manual_questions` (adds isTeen, hideName, askedById, askedByName), `participant_home` (live body, one expression changed: `askedByName` on each question). Rollback notes at the top of the file. No edge function deployed.

- Code review follow-up `20261022140000_teen_question_edit_owner.sql` applied live 2026-10-22: `support_update_manual_question` also requires the caller to still be the teen's Teen Support (checked rolled back: edit refused after the teen moves group).

## Decisions and why
- Owner chose: any time (not only class day), names hidden by default, the admin Questions list is the Q&A screen (no new view), Teen Supports only (adult supports cannot add for adults).
- "Teen" is worked out from the participant's age range (`fof_is_teen_age`), not stored.
- A support may only edit questions they typed themselves, and only while still NEW, so a teen's own words are never changed by staff.
- No notification when a support adds a question (they typed it; the support's group already sees it).

## How it was tested
- Rolled-back live transaction with the migration plus ten checks, then the same checks again against the live functions after applying (rolled back): own Teen Support adds (askedBy set, name hidden, text trimmed); list shows isTeen/hideName/askedByName; edit works; adding for an adult refused; edit after "to be answered in class" refused; another non-admin support refused for add and edit; teen's `participant_home` shows askedByName; a teen asking themselves gets hideName, an adult does not.
- `npm run build` passes; type errors unchanged (7, in the Website and Practice files); eslint clean on changed files.
- **Not tested in a browser** (no Teen Support, admin or teen login here, no mock harness in the repo). Please check: the card on a Teen Support's Home and Classes, the sheet on a phone, the admin Questions list with Teens first, and a teen's Week page before the manual is out.

## Open items
- A teen's Week page only lists weeks the app already shows them; the Ask box appears on any shown week.
- Frontend teen check uses `isTeenAgeRange` (normalised "10 - 17"); the database also accepts "Below 18" style values. Same values are stored today.

## How to pick this up
`frontend/src/components/questions/TeenQuestionsCard.tsx` holds the card and its sheet; the RPCs are in the migration above.
