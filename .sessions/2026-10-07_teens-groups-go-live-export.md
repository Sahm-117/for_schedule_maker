# Session: Teens steps 3-4 (groups, attendance, go-live move) and filtered WhatsApp exports

**Date:** 2026-10-07
**Branch:** main

## What Was Done
- **Teen groups:** `Group.isTeenGroup`; trigger `teen_group_sync` keeps each held teen in exactly one group, their Teen Support's "Teens - <name>" (leaves any adult group). Teen groups are hidden from meetings, recaps, prayer, onboarding and the group builder (`groupsApi.getAll` skips them unless `includeTeenGroups`; `getForSupport` and `resolveSupportScopedGroups` skip them). Admin Groups has a read-only "Teen groups" section; teens are left out of the builder's "not in a group" counts once teen handling is on.
- **Sunday attendance:** a Teen Support sees only their teens by default; "Show everyone, not just my teens" brings back the cohort list.
- **Guards:** `teen_owner_guard` refuses any owner change, or gender edit of a held teen, that leaves a teen without a same-gender Teen Support. Admin edit window limits the picker to those and has "This person is not a teen" (back to REGISTERED, no owner).
- **Admin Dashboard:** Teens card (signed up / with a Teen Support / onboarded / waiting, per-support load).
- **Go-live move:** `teen_enable_move` trigger on `AppSetting` runs `teen_move_existing()` once when `teen_flow_enabled` first becomes true: all current-cohort participants aged 18 and below become TEENAGER contacts with no adult owner (contact created if missing, e.g. Abimbola Oluwaseye); adult who held them is told. Teens are then placed by the normal sweep or admin "Assign now". For 48 hours after switch-on teen assignment ignores the quiet check (`teen_quiet_bypass_until`), then quiet applies again.
- **Exports:** Follow-ups (admin, support, Mobilisation) copy a WhatsApp list of exactly the filtered people with the filters named; Participants, Supports and Groups headers name their filters. Single "Copy" is now "Name - phone" (was tab-separated).
- **Teen Welcome page (participants):** `participant_teen_info` RPC + `TeenWelcomePage`; while teen handling is on, a teen with an app login (9 of the 14 have one, none set a password) sees only this page on every sign-in: first name, their Teen Support with a WhatsApp link (or "we are matching you"), what happens next, Log out. Admin "not a teen" releases them; if the check fails the normal app opens. FLOW_MAP rule 25.
- **Nightly age brackets:** `refresh_age_brackets()` via pg_cron 01:30 Lagos moves participants (date of birth) and supports (birth year) to their current bracket; a participant at "18 and below" stays until their cohort is COMPLETED or past its end date. FLOW_MAP rule 26. Only 20 of 289 participants have a date of birth.
- **Code review:** one high bug fixed (teen already in an adult group was skipped by the unique one-group rule), plus lock + unique index for teen groups, gender-edit guard, error text when Teen Supports fail to load.
- Verified with Playwright (support Attendance, admin Groups, Dashboard card, Follow-ups export, edit window) and rolled-back SQL runs of the full switch-on. Test rows removed.

## Files Changed
Migrations `20261007100000` to `20261007180000` (all applied live); `FLOW_MAP.md` rules 22-24; `SupportAttendancePage`, `AdminGroupsPage`, `AdminDashboardPage`, `AdminFollowUpsPage`, `SupportFollowUpsPage`, `SupportMobilisationPage`, `AdminParticipantsPage`, `AdminSupportsPage`, `FollowUpContactModal`, `ExportContactsPopup`, `GroupsExportPopup`, `SupportTagsModal`, `utils/{followUps,whatsappExport}.ts`, `services/{api,supabase-api}.ts`, `types/index.ts`.

## Key Decisions & Patterns
- Teen joins the group as soon as matched. Policy acceptance gate left out for now.
- Teen switch stays OFF until Olamide enables it after the team meeting; enabling does the move automatically, then press "Assign now".
- Four Teen Supports tagged: Grillo Oluwadare, Oluwatobi Bakare (male); Opeyemi Ogundipe, Olayiwola Monilola Ajoke (female). With the bypass, all 14 place (4/4/3/3).

## Pending Tasks
- Olamide enables teen handling after the meeting, then "Assign now"; check Teen Supports got their alerts.
- The 5 teens with no login (Abimbola Oluwaseye, David Abolade, Emmanuel Ogagu, Praise Ilori, Victor Chidilue) need nothing; the 9 with logins get the Teen Welcome page once the switch is on.
- Collecting dates of birth from more people (so brackets can follow the calendar) is not started.
- A person marked "not a teen" who refills the form as Below 18 becomes a teen again.
- Next topic: make the repo private, licence, and ways to credit Lightning Growth Consulting in the app.
- Faith Projects export unchanged (it filters inside its own popup).
