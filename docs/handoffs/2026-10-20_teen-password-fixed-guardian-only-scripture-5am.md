# Teen password fixed; guardian-only teen messages; scripture push at 5 AM

## Summary
- A teen who signs in with their own number cannot change or set the password; the guardian's password is shared and fixed for them. The guardian can still change it, and a Teen Support or admin can issue a new code.
- Teen contacts only offer messages to the parent or guardian, and none that carry a WhatsApp group link.
- The daily scripture post still opens at midnight; its push now goes out at 5:00 AM Lagos.

## Shipped (repo only, not pushed)
- Migration `20261020120000_teen_number_password_fixed.sql` (applied live 2026-10-21 after a rolled-back trial; both functions carry the guard and keep the 5-character minimum): patches `change_participant_password` and `set_participant_password` in place to raise `TEEN_PASSWORD_FIXED` for a `viaTeenNumber` session, and adds `participant_session_via_teen_number`.
- `ParticipantProfilePage.tsx`: Password shows "Set by your parent or guardian" instead of Change password when signed in through a teen's own number (`participantAppApi.passwordFixed`, false until the migration is applied).
- `supabase-api.ts`: plain wording for `TEEN_PASSWORD_FIXED`.
- `MessageTemplatePicker.tsx`: teen contacts see only `TEEN_PARENT` templates without `{{group_link}}`.
- `push-reminders`: `SCRIPTURE_PUSH_MINUTES = 5 * 60` (not deployed).
- FLOW_MAP rules 27, 67 and 83.

## Live changes
Migration `20261020120000` applied live on 2026-10-21 (Supabase Management API). `push-reminders` deployed as v55 on 2026-10-21 (Management API, server-side bundle of the repo at `3c45a04`; it also carries the Team-member birthday-viewer change and the midnight post). Dry runs: `asOf` 05:05 Lagos on 22 Oct would send `SCRIPTURE:2026-10-22` to 75 participants; 00:05 sends nothing.

## Decisions and why
- Only sessions through the teen's own number are blocked: on the guardian's number the app cannot tell guardian from teen, and the guardian must keep control.
- Templates are filtered in the app rather than deleted, so nothing in the database is removed.

## How it was tested
`npm run build` and eslint on the changed files. Not run against the database or in a browser.

## Code review (same day)
Fixed: `passwordFixed` missing from the non-Supabase api (tsc error); Open recording now starts on the current week; the opening is read once per hub/group and week instead of every minute and is cleared when either changes; a friendly error when Open recording is used before its migration is applied; teen picker banner and dead teen-number routing; one link-to-platform rule (`utils/links.ts`); Change password stays hidden until the check returns; Groups and the profile both treat `Participant.phone` as the guardian's number.
Kept on purpose: after a new code, a teen signing in with their own number cannot choose the password (they are told the guardian signs in first). That is the "fixed" rule; the guardian signs in first after any reset.
Push order: apply `20261019140000` (and `20261020120000`) before or straight after pushing, so Open recording and the teen password lock work.
