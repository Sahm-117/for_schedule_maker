# 2026-09-29 — Test accounts and test contacts

Came from: the Assign now dialog said 5 waiting while the card said 4. The card follows the cohort filter; Assign now covers every cohort. The 5th was Tunde Ojo (ZZ Demo Cohort, no gender), a test contact the user wants kept.

## Shipped (main)
- Admin Follow-ups → Contacts ⋮ menu: **Mark as test / Unmark as test**. Test contacts stay listed with a dashed "Test · ignored" chip but are left out of: the waiting count and Assign now dialog, the capacity/at-limit/waiting cards, the Overview, load rings (also on the Supports page), the admin Export contacts file, and the Mobilisation numbers. They get no "waiting" tag.
- Admin Users ⋮ menu: **Mark as test / Unmark as test** plus a "Test" chip. Test accounts work normally (log in, follow-ups and so on). They're skipped as auto-assignment targets and in the capacity/room checks, and show as "Name (test)" in the assign dropdown, so an admin can hand them test contacts by hand.
- Support views: supports only load contacts assigned to them, so real supports never see test contacts. The Mobilisation numbers exclude test contacts. The duplicate-number check still sees them, on purpose.
- Tunde Ojo was left untouched and is not marked as test; the user can mark him from the menu.

## Applied to production Supabase (2026-09-29, Management API)
- `20260929130000_test_accounts_and_contacts.sql`: `"User"."isTest"` and `"FollowUpContact"."isTest"` (boolean, not null, default false). The User column has SELECT-only grants and is changed via `set_user_test(p_token, target_user, p_is_test)`, which is admin-only via `app_staff` (a fake session is rejected with NOT_AUTHORISED). `run_followup_assignment` skips test contacts (load and hand-out) and test accounts (both target rules). The live body was diffed as identical to 20260929121000 before replacing it.

## Not covered / open
- Test accounts are only ignored in follow-up assignment and counts, not elsewhere (e.g. the rota, attendance, dashboards). Extend if the user asks.
- The Users page flow was checked by build and types only. The contacts-table flow was checked in Chromium with sample data.
- "Test Admin" (active) is not marked as test yet; the user can do it from Users.

## Later the same day
- Renamed the admin Follow-ups "All reps" filter to "All Supports" (25a1dd5).
- Search box on admin Follow-ups → Contacts and on the support Follow-ups page (name, email, number; 3+ digits; 0803… and +234… forms). While typing it searches across every cohort (57b33fb).
- Data fix (prod): Shola Fakolujo had two support accounts. The old "Mr. Shola" (59bb4d34…, no email, created 16 May) held 09097214447, which blocked saving it on "Akinsola Fakolujo" (949b4d28…). Cleared the phone on the old account and deactivated it. Its duplicate training attendance record was left in place, because the real account already has the same session marked Present.
- Support profiles (HubAuthorProfileModal) show "Last active" to everyone, not "Last active in Community" for non-admins. `20260929140000_user_last_active_for_staff.sql` (applied to prod): `user_last_active` now uses app_is_staff() instead of app_is_admin().
- Edge function `run-followup-assignment` (deployed as v2 via the Management API deploy endpoint; verify_jwt stays on): the 2-hourly admin "Follow-ups waiting to be assigned" alert now counts only the people the page shows as waiting (not test, not closed/NEXT_COHORT/ATTENDED, not a wrong number), in the current cohort only (the ACTIVE cohort with the latest startDate, plus no-cohort contacts). Before this, it counted any unassigned, unarchived contact in any cohort, which is why Tunde Ojo (test, ZZ Demo Cohort) kept triggering it.
- Follow-up contacts' email is visible (0d9e64e..5c921fb, merged to main from `claude/followup-contact-email`, which is kept on the remote until the user says to delete it). Why: Peace Oribi's contact Hannah Ezekiel had a number that didn't work, and supports had no way to see the email. Now the i pop-up shows the email (tap to email, plus a Copy button) and the ⋮ menu has "Send email" when there is one. The i pop-up shows supports only the number and email; the source and "Added" date are admin-only.
- Supports actually work follow-ups on **Mobilisation → Follow-ups** (SupportMobilisationPage cards), not the FollowUpContactsTable. A support guide image (`.sessions/mockups/support-email-guide.png`, made from the table) was sent to all supports, so the Mobilisation cards were changed to match it (0180ac6, ea284fd): an **i** by the name opens the number and email (tap to email, Copy), and a **⋮** menu has Copy number / Send message / Send email / Edit contact. That menu replaces the old pencil. Checked on the real page in Chromium with a fake support session and intercepted Supabase calls (a sample contact).
