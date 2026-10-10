# Roles and permissions (phase 1: hide only)

## Summary
Built from `docs/specs/roles-and-permissions.md` (FLOW_MAP rule 56).
- **Roles page** `/roles` (Administration, real admins only): list of roles (Admin locked, built-in Support, custom roles) and a tick grid of 21 modules x See / Add / Edit / Delete (tick a row or a column; Add/Edit/Delete switch See on; clearing See clears the rest), sticky Save bar, delete blocked while anyone holds the role, a note that this hides but does not yet block.
- **Users page**: role choices are now Support / Team member / Admin (Admin and Team member only for real admins). Team member roles are picked in the same dialogs (create and Roles). Role chips show custom roles.
- **Team member = database role `STAFF`.** Menu limited to the modules their roles can See; typed addresses show "No access" (`PermissionGate`); Add/Edit/Delete buttons are hidden across the admin pages (`can(module, action)`); logging in lands on the first allowed page.
- **Support** is unchanged. A Support who needs more modules is also given Team member access and switches views from the profile menu; they always sign in as Support.
- **Notifications** now go to everyone who can See the module (`module_viewers`), not to a fixed "Admin" role.

## Live changes
- **Applied live (13 Oct 2026):** `20261013085500_staff_role_value.sql`, `20261013090100_roles_and_permissions.sql`, `20261013100000_permissions_support_view.sql`, `20261013110000_lowest_role_staff_above_support.sql`, `20261013120000_module_viewers.sql`, `20261013130000_roles_review_fixes.sql` (code-review fixes: a Team member can no longer reset anyone's password except a plain Support's, role counts include deactivated holders, module check, Team-member tag on records). New role value, three locked tables, a built-in Support role row, the role functions; `app_staff()` / `app_is_admin()` / `attendance_session_actor_is_admin()` / `get_session_user` / `set_user_role(s)` / `switch_my_role` / `create_user` / `set_user_password` / `app_lowest_role` / `discussion_report_alerts` were replaced. Nobody's current access changed (no one holds the new role).
- **Edge functions changed in the repo, NOT deployed:** `notify-followup-issue`, `notify-followup-terminal-status`, `notify-group-meeting-completed`, `notify-onboarding-event`, `run-followup-assignment`, `receive-form-registration`, `daily-checks`, `push-reminders`, `notify-users` (and `_shared/notifications.ts`). Until they are deployed, Team members receive no admin notifications; admins are unaffected. Deploy: `supabase functions deploy <name>`.
- **Rollback:** the old function bodies are in git history and in the earlier migrations; `STAFF` can stay in the enum.

## How it was tested
Real browser (Playwright, local app against the live backend) with test accounts, since deleted: Team member with two roles (menu showed only their modules; typed addresses to other modules show "No access"; Participants had no "+ Add" without Add; Schedule showed Add Activity / Draft with Add+Edit); a Team member with no ticks (empty menu, No access everywhere); a Support (menu unchanged, signs in as Support); a Support who also has Team member access (switches to Team member view and back); an Admin (Roles page, locked Admin row, auto-tick of See, create, duplicate name refused, role assigned on Users page, delete refused while held). Zero page errors. `module_viewers` checked against the live admin list. Type check: same 27 old errors, none new (`npx tsc --noEmit -p tsconfig.app.json`; plain `-p .` checks nothing in this repo). `npm run build` passes.
Code review (`/code-review high`): 9 findings, 8 fixed (the 9th, untracked `frontend/dev-dist/`, was there before this work and is not mine). After the fixes: a Team member was refused when resetting another Team member's password, listing roles, or making someone admin, and allowed to reset a plain Support's password (checked against the live database with throwaway accounts, since deleted).
**NOT tested:** the notification edge functions (not deployed); every button on every page for a limited role (only Participants and Schedule were compared in the browser; the rest were gated by reading the code); phone width; Support-view regression on every shared page (Community, Group view).

## Things to know
- Hide only: a Team member counts as an admin inside the database, so a technical person could reach data outside their ticks. Real blocking is phase 2.
- A Team member's profile link goes to Settings; without the Settings module it shows No access (spec section 11, item 7).
- Deactivated admins no longer get the admin notifications that previously skipped that check.
- Left ungated on purpose: Community likes, the Planner sheets' Delete (shows for Edit without Delete), the hub author profile modal (shared with Community), exports and copy buttons.
