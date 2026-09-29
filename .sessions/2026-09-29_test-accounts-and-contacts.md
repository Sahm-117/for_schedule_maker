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
- Send email uses the message templates: Send email (⋮), tapping the email in the i pop-up, and the Email button in "Number needs checking" now open the same template picker as WhatsApp, in email mode. "Open email" is a mailto link with the subject "Foundation of Faith" and the personalised preview as the body, and it logs the contact as messaged, like WhatsApp. This is wired on Mobilisation, admin Follow-ups and support Follow-ups (MessageTemplatePicker `channel` prop; FollowUpContactsTable `onEmail`). Checked on the real Mobilisation page with a sample template.
- "Their login details" (LoginDetailsCard) has **Send by email** when the person has an email (d81ffd4, merged from `claude/login-details-email`). It opens a mailto with the subject "Your Foundation of Faith app login" and a message that says we couldn't reach them by phone or WhatsApp, introduces the support (name, TCN Ikorodu), gives the app link, username and first-time password, and asks them to reply with a working number. It includes the support's phone if they have one and signs off with their name. The email is passed from the Mobilisation follow-up cards, IT issues (looked up from allContacts) and the admin participant pages. Open question for the user: should ⋮ Send email keep opening the templates, or open the login details for people at Registered or Login shared?
- Sign-up search on Mobilisation → Registration (32c2a39, 7eb2c60): tapping the box brings it up under the header so the names aren't hidden by the phone keyboard; the results area keeps its height while searching; an X clears the box and keeps focus.
- Branch clean-up: this session's git access can't delete remote branches (push --delete gets a 403 or a disconnect), and there's no delete tool. These 12 are safe to delete on GitHub. Each is either fully in main or the head of a merged PR with no later commits. Tip SHAs are listed for restoring:
  - claude/followup-contact-email 5c921fbbabab3261d21a4c043a37b477e7c5a265
  - claude/login-details-email d81ffd41d0819ee6e67db003a4eeb2eb2e918495
  - claude/signup-search-scroll 7eb2c601afcb5bcc4d17a7a1744c5aae1255d4af
  - claude/invalid-number-handling 4872e803b86f5e8cb99cd1a847071b73e8aff9b0
  - claude/questions-badge ad09ae5f503eae2e91a41877eafaaf469c3a0258
  - claude/classes-in-order 4c9e404e7698dd53c84d39c0574e091f3474e47d
  - claude/announcements-obvious 36b6ccb9a34370e5ee7a688f4cd82331864ba673
  - claude/mobilisation-fixes 50968441a3d29004be92e6a99949486c05d2d60f
  - claude/mobilisation-onboarded-card 39e897e1bc975d0b3b55ed2bf565673fd238b839
  - stability-hardening f6df54dc33f324d5eeef7c1cc32cd0f5023a5c9b
  - fix/aikido-security-update-packages-38645621-rvhq 99f55a53523e2fc4da8e0fe0c041700072e9ef46
  - fix/aikido-security-update-packages-38644435-t1ai ba909308bab6b9360d51fee65ac38c2256c2bf98
  Kept, needs the user's decision: fix/duplicate-user-login (PR #4 closed without merging), codex/fof-ops-feature-polish and claude/fof-role-walkthrough-ewltt9 (no PR, histories diverge from main), and the dependabot backend branch (PR #7 still open).
- App guide (`frontend/public/guides/app-guide/content.js`) updated for today's changes. Support: the Follow-ups card (i pop-up, ⋮ menu), a new question "Their number doesn't work. How do I reach them by email?", templates by email, Send by email on login details, "fix name or number" now goes through ⋮ → Edit contact, and the sign-up search (moves up, X to clear). Admin: new questions on search, prior cohort → Attended and test contacts; updated capacity cards, alerts, Assign now, Message Bank, and Users (Mark as test). Screenshots: `support-follow-ups.jpg` was retaken from the real updated page (sample names) and `support-follow-up-menu.jpg` was added. Other guide screenshots weren't retaken.
