# 2026-09-29: Sign-up numbers, retakers, test participants

The admin Dashboard's sign-up cards disagreed with Follow-ups → Overview. Tracing that turned up data problems too.

## Shipped (main: 79c349d, f2bb0c0, 5d95c6d, f7dd690, from `claude/signup-numbers`, now safe to delete)
- **The Dashboard and Follow-ups now read the same numbers.** `computeFollowUpHeadline` in utils/followUps.ts gives Signed up, Needs login, Not done yet and Logged in. The Dashboard (before a cohort starts) loads contacts and uses it instead of cohort_health's Contacted/Replied/Registered. Those left out Google Form self sign-ups and dropped people from Registered once their login was shared.
- On Follow-ups → Overview, the **Dropped tile became Logged in** (ACCESS_CONFIRMED). The per-support table and the People brought table show **Logged in** instead of "Joined the app", which had counted logins shared. The support bar keeps login-sent people as a lighter segment. The Dropped column in the support table stays.
- **Test participants.** Participants ⋮ → Mark / Unmark as test adds a "Test · not counted" tag. They still sign in and use the app, but are left out of:
  - the Participants, Groups and Allocation counts;
  - cohort_health and cohort_people (the Dashboard, Supports page and participant health).
  
  Auto-distribute skips them, and they show as "(test)" on Allocation. `Participant.isTest` is set through the normal Participant update (RLS app_is_staff).
- **One participant record per cohort** (migration 20260929160000):
  - The unique phone index is now per cohort (`uniq_participant_phone_per_cohort`, on fof_phone_key and cohortId).
  - `sign_in` picks the newest cohort's record. It was rebuilt from the live body, with only the participant lookup changed.
  - A trigger `participant_retake_note` adds a profile note when a number already has a record in another cohort. It says "Retaking FOF. Was in Cohort 9." if the first name matches. Otherwise it says "Same phone number as X in Cohort 9. Check whether they're the same person."
- **receive-form-registration v9** (deployed, verify_jwt on): it also matches contacts in the current cohort whose follow-up has closed, preferring a current-cohort match. A repeat form from someone already signed up updates their name and email on the contact and participant, instead of creating a duplicate.

## Applied to production (Management API)
- 20260929150000_test_participants.sql and 20260929160000_participant_per_cohort.sql. The live cohort_health, cohort_people and sign_in were diffed against the repo or live first.
- ZZ Demo Participant (Cohort 10, a demo login for Olamide) is marked as test.
- New Cohort 10 participant records, linked to their Cohort 10 sign-ups, with profiles filled via fill_profile_from_form. Their Cohort 9 records are untouched.
  - **Josephine Asogba**: "Retaking FOF. Was in Cohort 9."
  - **Abisola Alabi**: same number as Abimbola Alabi (Cohort 9).
  - **Beulah Yalokwu**: same number as Chris Ayomide (Cohort 9).
  
  The form had failed to create any of them because of the old one-phone rule.
- Funmilayo: her second form corrected her surname. Her contact and participant are now **Funmilayo Ewayenikan**, and both SheetRegistration rows point at her one contact. The duplicate contact 7634f0bd was deleted with the user's approval. It had been auto-assigned to Azeta-Akhigbe Ofure at 20:40, who had a notification but hadn't acted on it.
- Result for Cohort 10: 50 contacts, 41 signed up, 41 counted participants, 5 logged in, 30 need login. Every sign-up has its participant record.

## Open
- Check whether Abisola Alabi and Beulah Yalokwu are the same people as the Cohort 9 records on their numbers.
- Tell Ofure that the Funmilayo follow-up she was given was a duplicate. Funmilayo's second form also asked "Are there other school asides FOF", which her support may want to answer.
- Retakers keeping their old password: nobody in Cohort 9 had an app account, so nothing was carried over. If it's needed later, the new record would need the old account copied.
- Test participants aren't excluded from supports' own group views or the daily-checks alerts. That matches how test accounts work elsewhere.

## Later: Retaking tag and sign-up form questions (f9f32e5, b4a6af2; `claude/retaking-and-questions` is now safe to delete)
- Rebased onto the other session's FOF Planner commit (de987e6). Its cohort_health keeps the isTest filter; checked live before applying.
- **Retaking tag.** RetakingChip (components/participants) shows **Retaking ›** when another cohort has a record on the same number with the same first name, and **Shared number ›** when the name differs. Tapping it says why. Supports and admins answer Same person / Different person (`Participant.retakeStatus` CONFIRMED / NOT_SAME, plus retakeCheckedById/At), or use ⋮ → Mark as retaking with a reason (`retakeNote`). It shows on admin Participants, the participant profile and the support ParticipantCard. RPC `participant_retake_matches(cohort)` runs as the caller.
- **Form questions.** `FollowUpContact.formQuestion` (+ AnsweredAt/ById) comes from "Any Other Questions or Concerns?". `form_question_text` ignores None/Nil/No and similar. Trigger `sheet_registration_question` adds each new sign-up's question and resets answered. Existing sign-ups were backfilled: 4 contacts, 5 questions (Funmilayo's two combined). FormQuestionBox appears on the Mobilisation card, as the Follow-ups table's "Asked a question" chip, and on the profile. Admin Follow-ups has a **Questions to answer (n)** filter.
- Migration 20260929170000 was applied to production. The trigger was tested in rolled-back transactions.
- Guide: participants-retaking, follow-ups-form-questions, s-form-question.
- Open: Beulah Yalokwu shows **Shared number** with Chris Ayomide (Cohort 9, Group 20, support Godswill Ndukwe, added by hand with only a name and number). The user is asking both of them. Abisola Alabi also shows Shared number (Abimbola Alabi, Cohort 9).

## 30 Sep: Waiting card (d82db74)
- Pulled the other session's FOF Planner step 4 (f3648d6, 1fc4f82) first.
- On Follow-ups → Contacts, the **Waiting to be assigned** card's big number now counts everyone with nobody assigned, matching the alert and Assign now. Under it: ready to assign / no same gender / gender not known. Tapping the number uses a new Assignment filter value, `all` ("Everyone waiting"). The guide tip was added.
- Why it came up: Esther (Switch) and Titilope Shofowora (Jesus Tribe), added by Opeyemi Ogundipe with no gender, showed as 0 on the card while the alert said 2. Someone has since assigned both by hand. They are prospects (NOT_REGISTERED), so they have no Participant record yet and don't appear on the Participants page.

## 30 Sep: Overview wording and the sign-up list stage chip (e901867, 699b30c, b6b8d92)
- Follow-ups → Overview and the Dashboard cards now read Signed up (measured against the target), Needs login, Login shared (new), Logged in, and Not signed up yet ("They need to be contacted to register"). "All N contacts" is grouped under Signed up and Not signed up yet. App-wide labels changed: Participant confirmed access → Logged in, Waiting → Messaged, no reply yet. Registered is kept as the step a support picks. Neutral pills no longer show the dash icon. The user confirmed people sign up only on the form, so the Signed up line says "They filled in the registration form".
- Mobilisation → Signed up on the form shows each person's follow-up stage (Login not shared yet / Login shared / Issue with login / Logged in / Next cohort), from contact.registrationStatus in formRegistrationsApi.
- Branches now fully in main, safe to delete: claude/overview-wording, claude/signup-status-chip.
