# Admin review: what is done and what is left (pick-up list for the next agent)

Date: 2026-10-31. The owner asked for one place another agent can finish from. The source is the admin pages review
written on 30 Oct (a Claude Doc the owner holds: about 70 suggestions across every admin page). This file lists
every suggestion's status, where the code lives, and how to work here safely. Read `README.md` in this folder and
`AGENTS.md` first.

## Summary
- **Done:** the "Fix first" items, most of Supports, Dashboard, Groups, Group meetings, Cohorts, Onboarding, Users
  (speed), Scriptures, Announcements (recipients), and a security pass with four fixes.
- **Left:** about 45 smaller suggestions, listed below by page. Each is frontend-only unless marked **[db]**
  (needs a migration) or **[fn]** (needs an edge function deploy).
- **Owner-only decisions** are listed separately. Don't build those without their answer.

## Done (with the handoff that covers it)
| Area | What shipped | Handoff |
|---|---|---|
| Late is not a miss | Late and Left early count as attended everywhere; Excused is left out of completion | `2026-10-30_late-counts-realtime-off.md` |
| Live-update feed | `Notification` off the Realtime publication | same |
| Announcements | Admin or server key only; recipient count before Send; a send to nobody is refused | `2026-10-30_admin-review-batch-1.md` |
| Speed | Supports (one last-active call, throttled reloads), Scriptures previews, Users paging, Groups shows cards before extras | batch 1 and batch 2 |
| Dashboard | "Class 2 of 10 done · Class 3 on …"; What needs you first while running | batch 1 and batch 2 |
| Supports | "This week" chase list; first tab is group leaders; No group separate | `2026-10-30_admin-review-batch-2.md` |
| Counts agree | One support definition (`countsAsCohortSupport`); "23 groups (+5 teen)"; Hubs "48 of 49 in a hub" | batch 2 |
| Groups | Overdue "Show them" bar | batch 2 |
| Group meetings | This-week card with remind; week tiles show class dates, "Not yet" for future weeks | batch 2 |
| Cohorts | Practice shows "Practice"; demo cohorts deleted (owner's request) | `2026-10-31_demo-cohorts-deleted.md` |
| Onboarding | Least-ready groups first; the stuck step on each card | commit f6d7a21 (no separate handoff) |
| Load and risks | Sunday-morning slowdown for background polls; the build runs the type check and 12 tests | `2026-10-30_risks-polling-build-checks.md` |
| Security | Sign-in limits; storage needs a session; private resource files with signed links; reminders job service-only; browser headers | `2026-10-30_security-hardening.md` |
| Primer | `sites/project-primer` What's new, Risks, Security sections | each handoff above |

## Left to do, by page
Frontend files are under `frontend/src/`. Keep to `AGENTS.md`'s UI rules: portal overlays, no native `<select>`,
`PageHeader.action` for primary actions.

**Supports** (`pages/AdminSupportsPage.tsx`)
- One database call for the whole page (supports, group, hub, last active, open follow-ups, missing reports).
  **[db]** A new RPC; today it still makes about 8 reads.

**Schedule** (`pages/AdminSchedulePage.tsx`, `components/ScheduleView.tsx`, `ActivityModal`, `CrossWeekModal`)
1. "Copy a standard week into every week" (recap, check-ins, group meeting). Reuse `CrossWeekModal`; don't add a
   parallel editor.
2. Make the "Draft" chip say what is unpublished, with a Publish button beside it.
3. Merge the Week focus and Activity tags bars.

**Approvals** (`pages/AdminApprovalsPage.tsx`)
1. When nothing is waiting, show a badge on the Schedule tab instead of an empty page.
2. When requests exist, show before and after side by side, with Approve all.

**Rota** (`pages/AdminRotaPage.tsx`; needs the owner's decision first, see below)
1. "Same person every week" fills a row in one tap.
2. A Dashboard warning when next week has an empty duty.

**Activity overview** (`pages/ActivityOverviewPage.tsx`)
1. Hide it while the schedule has no support tasks, or merge it into Schedule as a column.
2. Show who hasn't done what, by support.

**Planner** (`pages/AdminPlannerPage.tsx`, `utils/planner.ts`)
1. Markers on the cohort bar for the Saturday warning and class 3's automatic move (`absence_review_saturday`, rule 119) and the
   check-up dates (rest week 3, then monthly; rule 121, `restWeeksAfter`).
2. A "Plan cohort 11" button on the "2 cohorts start this year · aim is 3" line.
3. Tapping a holiday dot names the holiday.

**Participants** (`pages/AdminParticipantsPage.tsx`)
1. The people not in a group (8 today) at the top, with "Add to a group".
2. "Remind everyone missing details" on the profile-completion card (an announcement to those participants:
   `announcementsApi.send` with participant targets).
3. Keep the missed-classes card (`AbsenceReviewCard`) above the page's other cards (check it still is).

**Attendance** (`pages/AdminAttendancePage.tsx`)
1. A small attendance trend line across weeks at the top.
2. Make "N need a support assignment" a button that assigns them.
3. Reopen asks for a reason and tells supports the class is open again. **[db]** if the reason is stored.
   Respect the attendance lock (rule 118 and `attendance_week_locked`).

**Faith projects** (`pages/AdminFaithProjectsPage.tsx`)
1. Show "Overdue" once the write-by date has passed, with "Remind supports" (66 of 87 hadn't started on 30 Oct).
2. A filter by support.
3. A testimony count in the tab label.

**Hubs** (`pages/AdminHubsPage.tsx`)
1. Each hub's group meeting reports for the week, next to the recap line.
2. Which hub has the most supports flagged.

**Follow-ups**
1. Move the sign-up target card to the Planner, for the next cohort.
2. "Resend login" next to "registered but never signed in" (15 adults on 30 Oct).
3. The wrong-number warning opens that person.

**Feedback**
1. A one-tap prompt on participant Home after class 3 (only 1 response; answers stay hidden until 5).
2. After-class results per class as a small chart.

**Surveys**
- Show "Opens <date>" instead of "0 of 87 answered" for a survey that hasn't opened.

**Corporate prayers** (owner first; see below)
- "Copy last cohort's slots".

**Birthdays**
1. "Make all this week's graphics".
2. Post a graphic to the right group or hub chat in one tap.

**Community**
- Show the newest topic's date in the menu.

**Users** (`components/UserManagement.tsx`)
- "Last active" (use `users_last_active`) and "In cohort 10" columns instead of Created.

**Roles**
- How many people hold each role, and who, from the role row.

**Church app access** (`pages/AdminApiAccessPage.tsx`)
- Once a key exists, its requests per day as a small line (from `ApiRequestLog`).

**Announcements**
1. Read and "Got it" rates as a bar, not text.
2. "Send again to those who haven't seen it".

**Notifications**
1. Check whether the 5 am scripture reaches the same 49 people twice (a Reminder and a Push). If so, send one.
   **[fn]** `push-reminders`.
2. Group the list by type, with counts.
3. Flag anything sent to 0 people.

**Practice**
- Show who is in Practice right now, so an admin knows before switching it off.

**Resources and Scriptures**
- A link from the likes, downloads and shares totals to the PostHog dashboard.

**Website** (`pages/AdminWebsitePage.tsx`)
1. A Preview button that opens the homepage with unsaved changes.
2. When each section was last changed, and by whom. **[db]**

**Settings** (`pages/AdminSettingsPage.tsx`)
1. Group the cards by who they affect (participants, supports, admins), with a jump list.
2. A short "what changes if you edit this" under each rule.

## Waiting on the owner (don't build without an answer)
- **Practice** is switched on for all 47 supports, though only one used it in a day. Switch it off between
  trainings?
- **Onboarding limit:** 5 days flags almost everyone. 14 is the suggestion.
- **Rota:** every duty is empty for all 10 weeks, so its reminders go to nobody. Fill it, or turn those reminders
  off.
- **Mid-cohort survey:** it's off. Turn it on for week 5?
- **Corporate prayers:** not set up for Cohort 10. The owner says slots will likely be 6:30 am, 12 noon, 3 pm, 6 pm
  and 9 pm, daily.
- **Community:** the last posts are from Cohort 9. Pin a welcome, or hide it?
- **Old test accounts** (an "Admin User" from 2025): mark them as test, or switch them off.
- **Account statement audience:** check the Sept 2026 statement is meant for all supports.

## Other open items
- **Re-check the database load after Sunday 1 Nov.** Look at `pg_stat_statements` deltas and the slowest calls. If
  it still stalls, the free path is self-hosting Supabase on Oracle Cloud Always Free (from the 30 Oct research).
- **Survey uploads** (`survey-files/…`) still go to the public bucket. Move them to `private-files` before surveys
  collect files.
- **Tests** cover only the pure rules (`src/utils/__tests__/rules.test.ts`). Older `any` lint errors remain in
  several files.

## How to work here safely
- **Before any push:**
  - re-read `FLOW_MAP.md` section 4;
  - every commit message needs `Flow-Map: checked` (or `Flow-Map: n/a <reason>`), and the pre-push hook checks it;
  - never use `--no-verify`;
  - commit as the identity already in `git log` (the owner), never as an agent.
- **Build:** `npm run build` in `frontend/` runs `tsc -b`, the vitest rules, then Vite. All three must pass.
- **The repository is public.** The primer's password only protects the hosted page; its source is readable here.
  Never write anything that would help someone attack the platform: no unfixed weaknesses, keys, people's names or
  numbers.
- **Live database:** SQL goes through the Supabase Management API (`POST /v1/projects/<ref>/database/query`, with
  the access token from the environment). Test migrations in a transaction that ends in a raised exception and a
  rollback, then apply, then check live.
- **Edge function deploys** go through the Management API with every file in the folder, plus `_shared/` where it
  is imported. Keep each function's `verify_jwt`:

  | Function | `verify_jwt` |
  |---|---|
  | `push-reminders`, `file-links`, `send-announcement` | ON |
  | `public-api`, `telegram-webhook` | OFF (they check their own key or secret) |

  Check `GET /functions/<slug>` first.
- **Browser checks:**
  - create a temporary `AppSession` for the test admin (`a0000000-0000-4000-8000-000000000002`);
  - set `localStorage.accessToken = mock_token_<id>` and `sessionToken`;
  - block real sends in the test (route `send-announcement` and abort non-dry-run calls);
  - delete the session afterwards. Sessions slide to 90 days when used, so always delete them.
- **Deleting anything** (rows, files, functions, settings) needs the owner's yes for each target. Look first, and
  prefer a reversible step.
- **Finish each stretch with:** a handoff and `INDEX.md` row, the FLOW_MAP rule if behaviour changed, the primer's
  "What's new" if it's user-visible, a code review, then push.
