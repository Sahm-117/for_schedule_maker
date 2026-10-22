# One number, several people (couples, parents and teens)

## Summary
A couple, or a parent with teens, often share one phone. Owner's decisions (2026-10-22): one password per number, "Who is this?" lists everyone on the number, a different name on a used number is a new person (flagged), all alerts reach the shared phone, a reset resets the whole number, and existing different passwords keep working.
- **Sign-in:** unchanged (any password on the number opens it). With more than one person on the number they get **Who is this?** with each name and an Adult/Teen tag. The phone remembers the choice (localStorage, per sign-in) until **Switch person · <name>** in the menu.
- **One password:** choosing (after the setup code) or changing a password on one profile sets it for every login on the number.
- **Login card (support/admin):** "Shared number: one login and password for A and B…". Issuing a login to someone whose number already has one gives them that password, or the same waiting code. "Create new code" warns "This also resets B's login" and resets and signs out everyone on the number.
- **Alerts:** saving this phone for notifications saves it for everyone on the number, so each person's alerts arrive. They are **not yet labelled** with whose they are, and tapping one opens whoever is current.
- **Sign-up form:** an adult form with a different name on a number where someone else has already signed up becomes a new person, and admins get "New sign-up on a shared number". A form still claims a prospect a support added under another name who has not signed up yet (so nicknames don't create duplicates).
- **FLOW_MAP:** rule 3 changed (unique per number, cohort AND name), rule 91 added.

## Live changes
- Migration `20261022110000_shared_number.sql` applied live 2026-10-22: `uniq_participant_phone_per_cohort` now includes `fof_name_key("fullName")` (teens and the two named rows still exempt); new private `shared_number_people`; replaced `participant_family`, `participant_switch`, `set_participant_password`, `change_participant_password`, `participant_login_details` (adds `household`), `save_participant_push`. Rollback notes at the top of the file.
- Edge function `receive-form-registration` deployed as **v18** (v17 before). Built from the live-matching tree (commit `af2564b`) plus only this change, so the undeployed roles change (`tellAdmins` via `moduleViewerIds`) is still NOT live. The repo copy has both, like `push-reminders`.

## Decisions and why
- Household = same cohort + same phone key + ACTIVE; only people with a login appear in the picker.
- The duplicate guard stays for the same person (same name in any word order).
- Adult forms: matching a signed-up spouse by number alone used to overwrite their record; now only a not-yet-signed-up prospect is claimed by number.
- Named alerts left out: they need `push-reminders`, `send-announcement` and `notify-users` redeployed, and the repo copy of `push-reminders` is ahead of live (undeployed Team-member birthday change). Needs a live-matching build of each, or the owner's OK to ship the roles change.

## How it was tested
- Rolled-back live transaction (14 checks), then again against the live functions after applying: same person twice refused; husband and wife both issued, same code; picker shows both (adults); one password sets both; teen joins with the set password, picker shows three with teen tag; switch; change password updates all three, old fails; push saved for three; reset gives all three the same code and ends every session, household returned; legacy different passwords each work and show the picker; a teen's own-number session sees nobody and saves push only for itself, cannot switch; another cohort's person on the number is never included.
- `receive-form-registration` v18: boots and refuses calls without the form secret (401). The matching itself was **not** run: no form secret here for a dry run. Please send one test form on a shared number (or dry-run it from Apps Script).
- `npm run build` passes; type errors unchanged (7); no new lint errors.
- **Not tested in a browser** (no participant login here).

## Open items
- Named alerts ("Tomi: …") and tap-to-open-that-person.
- Anyone with the phone can open anyone's profile on it, a spouse's included (owner accepted).
- The two named exception adults now see each other in the picker and will share a password at their next change.
- A mistyped number that lands on someone else's: the login card shows "Shared number" with the other name, so a support can spot it.

## Gotchas
- `fof_name_key` already existed (used by teen functions); the index reuses it, don't redefine it.
