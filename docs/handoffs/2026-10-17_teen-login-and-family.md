# Teens back in the app: guardian-first login, own number, several teens per guardian number

## Summary
Teens use the normal participant app again (the Teen Welcome / WhatsApp page is no longer shown).
- The **guardian signs in first** on their number (`Participant.phone`), as today.
- A Teen Support can then add the **teen's own number** on the teen's card in My Group ("Their own number to sign in"). It is a second number on the **same login and password**, not a second account. It stays locked ("waiting for their parent or guardian") until someone on the guardian number has chosen a password.
- **Several teens on one guardian number**: after a guardian-number sign-in a "Who is this?" screen lets them pick a teen (switch later from the menu). A teen who signs in with their own number never sees the others. Guardians see everything the teen sees.
- Also in this stretch (separate commit): a a Teen Support's own teens now load on My Group and Home (the group lookup skipped teen groups).

## Also in this stretch (frontend only, local until pushed)
- Admin Users page on a phone: role chips now sit under the details, so a person with several roles no longer squeezes their name and date (rule: none, layout fix).
- "Access confirmed" / "Not signed in yet" chip on the admin Groups page's member rows and on My Group participant cards (FLOW_MAP rule 68). Reads the existing `participants_signed_in`. Richer states (login issued but never used, no login at all) are not shown yet.
- Faith project chip on the group people overview (admin / hub lead view of a group) opens the project in a popover (`FaithProjectPopover`, FLOW_MAP rule 69); the rest of the row still expands the details. Not tested with a real hub lead account (their read permission on Faith Projects was not checked).
- Back button (phone, browser or a page's Back link) returns to the scroll position you left instead of the top (`ScrollToTop`, FLOW_MAP rule 70). Tested in a browser against a mocked backend on the admin Groups page; not tested on a real phone or on every page.
- Conversation starters for supports: typing "/" in the group message box (support only) offers 14 ready-made starters plus today's scripture; a scripture picture link in a post shows as the picture (FLOW_MAP rule 71). Frontend only. Tested in a browser against a mocked backend; not tested on a real phone keyboard or with a real scripture picture.
- Teens have their own class teacher: Cohorts week editor > Class card > Teacher > Adults / Teens; teens and Teen Supports see the teen teacher, and fall back to the main teacher when none is set (FLOW_MAP rule 72). Tested in a browser against a mocked backend (editor tabs, both teachers saved together) and in a rolled-back live transaction (teen, adult, no teen teacher, no teachers). Not tested: a real teen's Home card and the Teen Support Recap page in a browser.

## Live changes
**Applied live (17 Oct 2026):** `20261017100000_teen_login_phone.sql` (after a rolled-back run of 20 checks; the same 20 checks passed again against the live functions, rolled back) and `20261017110000_discussion_summary_with_teen_groups.sql` (the admin Dashboard "Discussions this week" line counts teen groups again; checked rolled back: 23 groups incl. 5 teen, a teen-group post counts). No edge function deployed. Also applied live: `20261017120000_teen_class_teacher.sql` (four teen-teacher columns on `Week`; `participant_home` replaced, one expression changed).
`20261017100000` adds: `AppSession."viaTeenNumber"`, table `ParticipantLoginPhone` (locked), `sign_in` (replaced), `participant_family`, `participant_switch`, `teen_login_state`, `teen_login_phone_set`, private helpers `teen_login_staff_allowed`, `teen_family_members`. Rollback notes are at the top of the file.

## Decisions and why
- Own number = alias on the same account (the request said "log in with that login"); no second password, so no changes to set/change-password code.
- One password per teen stays. If a teen changes it in Profile, the guardian's login for that teen changes too (with several teens, any one teen's password still opens the picker). Support can issue a new code.
- The Teen Welcome page and `participant_teen_info` were left in place, unused (nothing deleted).

## How it was tested
- Database: rolled-back live transaction with throwaway teens/adult/sessions: guardian sign-in and family of two, switch (old session dies), adult unaffected, admin state, own number set, own-number sign-in, no family offered through the own number, switch refused through it, wrong password, locked (`GUARDIAN_FIRST`), same-as-guardian, number in use (adult number and another teen's own number), bad number, adult refused, unrelated support sees nothing and is refused, remove (own-number sessions end, number stops working).
- Browser (Playwright, local app) against a **mocked backend**: picker shown for two teens, switching opens the other teen, nothing for one teen; Teen Support card shows the locked note, Add number, save and Change/Remove. `npm run build` passes.
- **Not tested:** real accounts on live data after the migration is applied; push notifications on a shared phone; first-time Welcome guide appearing over the picker (it does, then the picker).

## Open items
- Smoke-test with one real teen after the first guardian sign-in.
- Of 20 active teens, 19 have no guardian number recorded (number owner unknown); for them `Participant.phone` may be the teen's own. The guardian-first lock still applies.
- Teen group discussion is on: it works for a teen group (teens and their Teen Support) because it is generic over groups. Admin now sees it: the Dashboard line counts teen groups and the teen cards on the admin Groups page have an icon that opens the group and its discussion (rule 37). Not browser-tested end to end on live data; a hub lead's view of a teen group was not checked.
