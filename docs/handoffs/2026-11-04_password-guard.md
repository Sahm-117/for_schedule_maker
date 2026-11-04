# The password guard: one number, a staff account and participant logins

Date: 2026-11-04.

## Summary

A staff member can have their teens registered on their own number (rule 91). Sign-in tries the staff account first, then the participants on that number, and tells them apart by the password. If the teens' password were the same as the staff password, the staff account would always open and the teens' login could never be reached, with no message saying why. The guard stops that mistake when the password is chosen:

- **Teens' side:** choosing or changing the participant password is refused if it opens a staff account on the household's number: "This password already opens a staff account on this number. Choose a different one for this login."
- **Staff side:** a staff member changing their own password, or an admin resetting it, is refused if a participant login on that number already uses it.
- **Guessing:** so the message can't be used to guess the staff password, every participant-side check that doesn't match counts as one wrong try against that staff account's sign-in limit. Ten in 15 minutes pauses it, and that also pauses the staff sign-in for 15 minutes, the same as wrong sign-ins.

FLOW_MAP rule 133.

## Live changes

- Migration `supabase/migrations/20261104120000_password_guard.sql`.
  - **New (internal, not callable with the public key):** `password_staff_clash`, `password_family_clash`.
  - **Replaced, each adding only its guard lines:** `set_participant_password`, `change_participant_password`, `change_own_password_check`, `set_user_password(text, uuid, text, boolean)`.
- **Applied live on 4 Nov 2026** (Management API, one transaction). Checked afterwards: both helpers present and not callable with the public key; all four functions carry the guard and are still callable by the app.
- No edge function changed.

## How it was tested

A rolled-back transaction on the live database, using a throwaway staff account on a Practice test participant's number:

- The participant can't set or change their password to the staff password; another password works.
- The staff member can't change to the participant's password, and an admin reset to it is refused.
- A wrong current password still just returns false, without revealing anything.
- Sign-in then opens the participant login with the participant password and the staff account with the staff one.
- A participant on a different number may use any password.
- 10 non-matching checks pause it: the 11th is refused, and the staff sign-in is paused.
- The public key can't call the helpers.

`npm run build` passes, and `git diff --check` is clean.

## Open items / gotchas

- `create_user` is not guarded. That case is an admin creating a staff account on a number that already has participant logins with the same password, which is very unlikely.
- Households that already share a password are not detected or changed. The fix is to change either password.
- Many password changes by the teens in 15 minutes (10 or more) briefly pause the parent's staff sign-in. That is deliberate.
