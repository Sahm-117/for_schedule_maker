# Teens back in the app: guardian-first login, own number, several teens per guardian number

## Summary
Teens use the normal participant app again (the Teen Welcome / WhatsApp page is no longer shown).
- The **guardian signs in first** on their number (`Participant.phone`), as today.
- A Teen Support can then add the **teen's own number** on the teen's card in My Group ("Their own number to sign in"). It is a second number on the **same login and password**, not a second account. It stays locked ("waiting for their parent or guardian") until someone on the guardian number has chosen a password.
- **Several teens on one guardian number**: after a guardian-number sign-in a "Who is this?" screen lets them pick a teen (switch later from the menu). A teen who signs in with their own number never sees the others. Guardians see everything the teen sees.
- Also in this stretch (separate commit): a Teen Support's own teens now load on My Group and Home (the group lookup skipped teen groups).

## Live changes
**Not applied yet.** The migration `20261017100000_teen_login_phone.sql` is in the repo and was run live inside a transaction that always rolled back (20 checks passed, nothing kept). Until it is applied the new RPCs do not exist: the app falls back safely (no picker, the card row stays hidden), but own-number sign-in is not available.
The migration adds: `AppSession."viaTeenNumber"`, table `ParticipantLoginPhone` (locked), `sign_in` (replaced), `participant_family`, `participant_switch`, `teen_login_state`, `teen_login_phone_set`, private helpers `teen_login_staff_allowed`, `teen_family_members`. Rollback notes are at the top of the file.

## Decisions and why
- Own number = alias on the same account (the request said "log in with that login"); no second password, so no changes to set/change-password code.
- One password per teen stays. If a teen changes it in Profile, the guardian's login for that teen changes too (with several teens, any one teen's password still opens the picker). Support can issue a new code.
- The Teen Welcome page and `participant_teen_info` were left in place, unused (nothing deleted).

## How it was tested
- Database: rolled-back live transaction with throwaway teens/adult/sessions: guardian sign-in and family of two, switch (old session dies), adult unaffected, admin state, own number set, own-number sign-in, no family offered through the own number, switch refused through it, wrong password, locked (`GUARDIAN_FIRST`), same-as-guardian, number in use (adult number and another teen's own number), bad number, adult refused, unrelated support sees nothing and is refused, remove (own-number sessions end, number stops working).
- Browser (Playwright, local app) against a **mocked backend**: picker shown for two teens, switching opens the other teen, nothing for one teen; Teen Support card shows the locked note, Add number, save and Change/Remove. `npm run build` passes.
- **Not tested:** real accounts on live data after the migration is applied; push notifications on a shared phone; first-time Welcome guide appearing over the picker (it does, then the picker).

## Open items
- Apply the migration, then smoke-test with one real teen.
- Of 20 active teens, 19 have no guardian number recorded (number owner unknown); for them `Participant.phone` may be the teen's own. The guardian-first lock still applies.
- Teen group discussion: the discussion works for a teen group (teens and their Teen Support) because it is generic over groups; admin summary still skips teen groups (rule 37). Decide whether to keep it.
