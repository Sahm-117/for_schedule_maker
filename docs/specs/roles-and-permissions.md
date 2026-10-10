# Roles and permissions (build spec)

Status: **built (13 Oct 2026), not yet pushed.** Written 10 Oct 2026 from the product quiz; updated 13 Oct with what the build found (sections 5, 7, 9, 11, 13).
Phase 1 (this spec) hides menus, pages and buttons. Phase 2 (database blocking) is deliberately later, see section 9.

## 1. What this is for

More people are being added to the platform and they should not all see everything. An Admin creates **roles**, ticks which **modules** each role can **See / Add / Edit / Delete**, and gives people those roles. If a role cannot see a module, that module is not in their menu.

## 2. Decisions already made (do not reopen)

| Topic | Decision |
|---|---|
| Creating roles | Admin makes their own roles, any name, tick boxes. No developer needed for new roles |
| Ticks per module | **See, Add, Edit, Delete.** No other special actions (no separate Approve / Export / Send) |
| Module rows | One row per admin menu item (21 rows, section 4). Sub-pages sit under their parent |
| Strictness | **Phase 1: hide only** (menus, pages, buttons). Real database blocking comes later |
| Admin | Always sees and does everything. Cannot be edited or locked out |
| Support | Becomes an editable role, but the support screens stay exactly as they are (section 5) |
| Several roles on one person | Custom roles combine. A Support who also has Team member access switches between the two views from the profile menu |
| "Only my own people/group" limits | No. Access is all or nothing per module |
| Who manages roles | Admin only |
| Blocked page / no Dashboard | Land on the first page they are allowed; a blocked page says "No access" |

## 3. How it works today (verified in code)

- Roles in the database: `ADMIN`, `SOP_PREPARER`, `SUPPORT` (`supabase-schema.sql:5`, `20260517000000_sop_preparer_role.sql`). A person has a home role plus an optional list of extra roles, and can "act as" one (`20261001260000_multi_role_login.sql`, `20261001270000_acted_as_role.sql`). The app has no screen or menu behaviour for `SOP_PREPARER`.
- The only on-screen check is "is this person an Admin": `isAdmin` in `hooks/useAuth.tsx:287`. The menu hides items marked `adminOnly` (`components/AppShell.tsx:114-215`). Route table is `App.tsx:105-193` with no per-page role check.
- Only the Users page refuses non-admins (`pages/AdminUsersPage.tsx:10-16`). Seven admin pages have no admin check of their own (Birthdays, Resources, Onboarding, Scriptures, Settings, Survey results, Surveys).
- Database rules mostly say "any staff member" (`app_is_staff()`), and a few tables say "admin only" (`app_is_admin()`). Role changes are admin-only (`set_user_role`, `set_user_roles`). This is why phase 1 is hide-only: menus will be hidden but the database still trusts any staff member.
- Role assignment UI: `components/UserManagement.tsx` (role badges ~l.19-35, role modal ~l.1066-1083, SUPPORT/ADMIN tick boxes).

## 4. Modules (the rows of the grid)

Taken from the admin menu groups in `AppShell.tsx:137-185`. Sub-pages fold into the parent (the menu already groups them into tab strips).

| Group | Module | Also covers (sub-pages) |
|---|---|---|
| Overview | Dashboard | |
| Programme | Schedule | Approvals, Rota, Activity overview |
| Programme | Planner | |
| People & groups | Participants | Participant profile, Attendance, Faith projects, Onboarding |
| People & groups | Groups | Allocation, Group meetings (Group prayers), Group view |
| People & groups | Supports | |
| People & groups | Hubs | |
| People & groups | Cohorts | |
| Engagement | Follow-ups | |
| Engagement | Feedback | |
| Engagement | Surveys | Survey results |
| Engagement | Corporate prayers | |
| Engagement | Birthdays | |
| Engagement | Community | |
| Administration | Users | |
| Administration | Announcements | |
| Administration | Notifications | |
| Administration | Practice | |
| Administration | Resources | Scriptures |
| Administration | Website | |
| Administration | Settings | |

One extra row that is **not** in the grid: **Roles** (the new screen). It is Admin only, always.

Open to every signed-in staff member regardless of role (not modules): team announcements feed, `/support/pray`, `/sop-download`, the support screens, Profile.

## 5. Admin, Support and the new roles

- **Admin** (`ADMIN`): bypasses the grid. Sees everything. Shown on the Roles screen as a locked row.
- **Team member** (new database role `STAFF`): gets the admin-style menu limited to the modules their custom roles allow. Behind the scenes it counts as an admin (section 9), so everything the grid shows works.
- **Support** (`SUPPORT`): its support screens are unchanged and are not part of the grid. It appears on the Roles screen as the built-in Support role; its ticks only apply to a Support person who has also been given Team member access, in their Team member view.
- **Support who needs more modules:** an Admin gives them Team member access as well (Users, Roles). They sign in as Support and switch to the Team member view from the profile menu (the existing multi-role switch). This replaced the earlier idea of one combined menu: a Support is not an admin behind the scenes, so extra admin pages would have been refused by the database.
- A Support in the Support view keeps a short list of admin pages their own screens link to: group view, group prayers, faith projects, schedule, community, resources, team announcements.

## 6. Rules

1. **See off:** module missing from the menu, direct address shows a "No access" page, and its numbers do not appear (e.g. the Approvals pending badge only shows to someone who can See Schedule).
2. **Add / Edit / Delete off:** the matching buttons are hidden (or shown disabled where hiding would confuse). Add, Edit and Delete cannot be ticked unless See is ticked. Ticking them auto-ticks See.
3. **Combining roles:** a tick is on if any of the person's roles has it on.
4. **Landing:** after login, go to the first module they can See, in menu order. If they can See nothing at all, show a "No access yet, ask an Admin" screen with Log out.
5. **Admin protection:** the last Admin cannot be demoted. An Admin cannot be given a restricted role by accident (Admin stays Admin).
6. **Deleting a role:** blocked while anyone holds it. The Admin sees the list of people and must reassign them first. No silent removal.
7. **Existing special rule kept:** the Practice-cohort lock on Users and Resources (`AppShell.tsx`) stays as it is.

## 7. Data model

Matches the existing style (locked tables, functions that check the caller's session token).

- `Role` enum gains `STAFF` ("Team member"). `SOP_PREPARER` is untouched (checked live: nobody holds it).
- `PermissionRole` (`id`, `name` unique ignoring case, `description`, `isSystem`, timestamps), `PermissionRoleModule` (`roleId`, `module`, `canView`, `canAdd`, `canEdit`, `canDelete`), `UserPermissionRole` (`userId`, `roleId`). All three are born locked.
- A built-in Support role row (`isSystem`) is seeded; it cannot be renamed, deleted or assigned directly.
- Functions: `perm_list_roles`, `perm_save_role` (Add/Edit/Delete imply See), `perm_delete_role` (blocked while anyone holds it), `perm_set_user_roles`, `perm_user_assignments` (all real admins only), `get_my_permissions` (any staff), `module_viewers(module)` (internal, for notifications).
- `app_staff_real()` is the true role; `app_staff()` now maps STAFF to ADMIN.
- Files: `supabase/migrations/20261013085500` to `20261013130000` (six files).

## 8. Screens and code

- **Roles page** (Admin only, new menu item under Administration): list of roles on the left; the grid for the selected role on the right (rows = 21 modules grouped as in section 4, columns = See / Add / Edit / Delete, plus a "tick whole row" and "tick whole column"). Sticky bottom save bar (Cancel quiet, Save accented). In-page dropdowns and portal overlays per the house UI standards. Shows how many people hold each role.
- **Users page:** the role picker gets a "Roles" section listing the Admin's roles with tick boxes, next to the existing Admin/Support choice.
- **One shared hook** `usePermissions()` with `can(module, 'view' | 'add' | 'edit' | 'delete')`, built from the person's resolved roles. `isAdmin` shortcuts everything to true.
- **Menu:** replace the `adminOnly` flag with a module key on each item; `canShowNavItem` becomes `can(module, 'view')`.
- **Route guard:** a route-to-module map covering every admin route, including sub-pages and detail routes (e.g. `/participants/:id`, `/surveys/:id`, `/group-view/:id`).
- **Buttons:** every admin page's Add / Edit / Delete controls (and bulk actions, import, export menus) are wired to `can(...)`. This is the largest part of the work.
- **Notification deep links** into a page the person cannot see land on "No access", not a blank page.

## 9. How far "hide only" goes (and phase 2)

About 50 database functions and 15 rules say "Admins only" (planner, surveys, birthdays, supports, users, and more). So that a Team member's ticks actually work, the database treats a Team member as an admin (`app_staff()` and `app_is_admin()`). The result: menus, pages and buttons follow the grid, but a technical person with a Team member login could still reach data outside their ticks by other means. The Roles screen says so.
Still real-admin only, checked with the true role: creating or changing roles, giving roles, changing anyone's role, creating anyone above Support, resetting an admin's password.
Phase 2 (later): every function and rule reads the grid instead of "is an admin".

## 10. Build order

1. Module key list, tables, RPCs, and the migration that creates Admin and Support roles and links existing Support users.
2. `usePermissions()`, menu gating, route guard, No access page, landing rule.
3. Roles page and the Users role picker.
4. Button gating, module by module (biggest first: Participants, Groups, Schedule, Users, Settings).
5. Verify with Playwright, logging in as a person for each kind of role (not just Admin), checking the menu, a blocked address, hidden buttons, combined roles, and zero console errors. Clean up the test roles and test users afterwards.

## 11. Open items (resolved defaults)

1. **Support's grid.** Resolved: Support screens fixed; extra modules only through Team member access (section 5).
2. **Approvals and Rota** sit under Schedule (visible with Schedule See; the page's own buttons follow Schedule Edit).
3. **Scriptures** falls under Resources.
4. **SOP_PREPARER:** checked live, nobody holds it. Left untouched.
5. **Staff with no ticks:** see only the open pages and "No access yet".
6. **Naming:** the screen is "Roles" in the menu (Administration group, real admins only).
7. **Profile link:** a Team member's profile menu points at Settings, so without the Settings module it shows No access. To decide.

## 12. Out of scope

Database-level blocking (phase 2), own-group-only limits, special-action ticks, approval flows for role changes, participant (non-staff) access, and any change to the support screens.

## 13. Notifications follow module access

Admin notifications used to go to every user whose role is Admin. They now go to everyone who can See the module the notification is about: admins plus Team members with the See tick (`module_viewers`). Mapping: Follow-ups (new prospect, waiting to be assigned, issues, status changes, sheet sync), Groups (meeting completed, reported posts, outstanding meeting reports), Participants (flagged participant, testimonies, onboarding events, red-participant and help digests), Supports (red-support and onboarding-window digests), Birthdays (birthday alerts), Feedback (manual questions). Types addressed to specific people (a support's own group, an owner, announcements, hub and prayer messages) are unchanged.
Deactivated admins no longer receive these (some paths already skipped them). A Team member who is the actor on an event is treated like an admin actor (no self-alert).
