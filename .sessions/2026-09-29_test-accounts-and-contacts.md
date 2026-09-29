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
