# HANDOFF: FOF Planner and Group Discussion (with hub-lead group view)

Written 2026-09-29 at the end of a long session, for a fresh Claude Code session on this repo (`Sahm-117/for_schedule_maker`). Everything needed is here or linked. Read this whole file before doing anything.

---

## 0. Paste-this-first prompt (for the user to start the new session)

> Read `AGENTS.md`, then `.sessions/INDEX.md`, then `.sessions/2026-09-29_HANDOFF-planner-and-discussion.md` in full. Look at the mock-up images it lists. Then reply with (1) your understanding of the FOF Planner and the Group Discussion, (2) your build plan split into small, separately pushable steps, and (3) any questions. Don't build, change the database or push anything until I say go.

---

## 1. How this user works (non-negotiable)

1. **Understanding first.** Before building, restate your understanding. For any UI, include **rendered screenshots plus a short explainer** (not raw HTML files). Build only after an explicit "go", "build", or "build and push".
2. **Pushing.** Push to `main` only when told. Use a side branch (`claude/<topic>`) to show work-in-progress without deploying. `main` auto-deploys to production via Vercel (root `frontend`, `npm run build`).
3. **Git identity.** Author: `Sam <[redacted-email]>` (`git commit --author="Sam <[redacted-email]>"`). The committer is the session's signing identity (Claude, noreply@anthropic.com); leave it, because the stop hook checks it. End commit messages with the Co-Authored-By and Claude-Session trailers the harness gives you.
4. **Plain language.** Explain things in plain words to a non-developer: what changes for admins, supports and participants. Use Nigerian church context (TCN Ikorodu, "Foundation of Faith" = FOF, Cohort 10 etc.). Use sample names in mock-ups, never real people.
5. **Deleting or overwriting.** Never delete data, files, branches or DB objects as a side effect. Ask per target first. Data fixes on production need an explicit OK.
6. **Session notes.** After shipping, add to `.sessions/` and `.sessions/INDEX.md`. `.sessions/` is git-ignored, so use `git add -f`. Never record secrets.
7. **Keep scope tight.** Change only what was asked, with no adjacent refactors. The exception is the class-date refactor below, which the Planner needs; explain it to the user before doing it.

## 2. Environment facts learned the hard way

- **Production DB changes:** direct `psql "$SUPABASE_DB_URL"` hangs (network). Use the Supabase **Management API** with the env vars `SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_REF`:
  ```bash
  jq -n --arg q "$(cat supabase/migrations/<file>.sql)" '{query:$q}' | curl -sS -X POST \
    "https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF/database/query" \
    -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" --data @-
  ```
  Before replacing any existing function, read its live definition (`pg_get_functiondef`) and diff it against the repo copy. Verify after applying (columns, grants, function body). Read-only queries against production are fine; writes need the user's go.
- **Edge functions:** there's no Supabase CLI. Deploy with a multipart POST to `.../v1/projects/$REF/functions/deploy?slug=<name>`, with `metadata={"name":..,"entrypoint_path":"supabase/functions/<name>/index.ts","verify_jwt":true}` and one `file=@...;filename=<repo path>` per file, **including `_shared/*` imports**. Check the response version number.
- **Auto mode** sometimes fails with "classifier no verdict". Retry once, then stop and tell the user; don't loop.
- **Deleting remote branches doesn't work** from this environment (403). Don't try.
- **Don't `pkill -f vite`**: it matches and kills your own shell. Stop a background dev server with TaskStop, or by port (`lsof -t -i:5199`).
- **Stop hook:** it refuses to end a turn with uncommitted changes. Commit to a side branch if the user hasn't said go.

### Browser verification recipe (used all session)
The app needs a signed-in session and a live backend, so render the real pages with a fake session and intercepted Supabase calls:
- Run the dev server: `cd frontend && VITE_SUPABASE_URL=http://127.0.0.1:9 VITE_SUPABASE_ANON_KEY=placeholder npx vite --port 5199 --strictPort` (in the background).
- Playwright is global at `/opt/node22/lib/node_modules/playwright/index.mjs`; import it by that path.
- `ctx.addInitScript` sets `localStorage` `accessToken`, `sessionToken`, `user` (JSON with `role`, `id`, `name`, `isActive:true`, `onboardingCompleted:true`) and `activeCohortId`.
- `ctx.route('http://127.0.0.1:9/**', ...)` answers `/rest/v1/<Table>` with arrays, and `/rpc/<fn>` with objects or null. Honour `Accept: application/vnd.pgrst.object` by returning a single object.
- Load the page twice (Vite optimises deps on the first load), and dismiss the "Welcome to V2" modal with "Not now".
- Screenshot elements, not full pages: sticky headers and bottom nav overlap.
- For quick component previews, a temporary `frontend/harness-tmp.html` + `src/harness-tmp.tsx` works. Delete them and `frontend/dev-dist/` afterwards.
- `npm run build` must pass. `npx tsc -b` has about 27 **pre-existing** errors (CoverRequest types, AdminWebsitePage and others); make sure you add no new ones in the files you touch.

## 3. Architecture primer (the parts you'll touch)

- **Frontend:** React, Vite, Tailwind, a PWA (`frontend/src`). Routes are in `App.tsx`: staff under `/…` and `/support/…`, participants under `/me/…`. The shell is `components/AppShell.tsx` (participant shell: `components/participantApp/ParticipantShell.tsx`). Follow the AGENTS.md UI rules:
  - use `PageHeader.action`;
  - no native `<select>`: use `AppSelect` / `AppMultiSelect`;
  - render overlays through a portal to `document.body`;
  - put secondary actions in `AppOverflowMenu`;
  - keep the admin mobile bottom nav as Dashboard / Schedule / Approvals / Resources.
- **Data layer:** `services/api.ts` re-exports `services/supabase-api.ts` (a legacy mock fallback is also exported; add no-op stubs there when adding methods). Types are in `types/index.ts`. Global state (`activeCohort`, cohorts, `liveRevision`) is in `context/AppDataContext.tsx`. Toasts use `useToast()`, called as `toast({ message, tone })`.
- **Auth (custom, not Supabase Auth):** DB sessions in `"AppSession"`. SQL helpers:
  - `app_staff(p_token)` returns the staff `"User"`;
  - `app_participant_id(p_token)` returns the participant;
  - `app_is_admin()` / `app_is_staff()` / `app_current_user_id()` read the request's token header;
  - `app_hub_can(hubId, perm)`: the hub lead (`"SupportHub"."leadUserId"`) or an assistant with that permission.

  Participants reach data **only through SECURITY DEFINER RPCs** taking `p_token` (see `participant_home`, `participant_people` and others in migrations `20260917*`). Staff tables mostly use column grants plus RLS. The `"User"` table has **column-level grants**, so any new User column needs an explicit `GRANT SELECT(col)`, and writes go through admin-checked RPCs.
- **Cohorts, weeks, schedule:**
  - `"Cohort"` (`startDate` = first class Sunday, `endDate`, `status` ACTIVE/COMPLETED/ARCHIVED);
  - `"Week"` (`cohortId`, `weekNumber`, recap and manual fields; **no date**);
  - `"Day"` → `"Activity"` for the admin schedule;
  - cohort admin: `pages/CohortsPage.tsx`.
- **Groups and hubs:**
  - `"Group"` (`supportId`, `meetingDay`, `meetingTime`, `meetingDurationMins`, `callPlatform` WHATSAPP/GOOGLE_MEET, `callLink`);
  - `"GroupParticipant"`;
  - `"SupportHub"` (`leadUserId`, `assistantLeadUserId`, `assistantPermissions`);
  - `"HubMembership"` (hubId, userId, cohortId): one hub per support per cohort.

  Hub UI: `pages/SupportMyHubPage.tsx`, `pages/AdminHubsPage.tsx`. Call UI: `components/groups/GroupCallCard.tsx`.
- **Existing staff Community** (`pages/CommunityPage.tsx`; tables `HubTopic`, `HubComment`, `HubReply`, `HubReaction`) is for supports and admins only. **Keep it unchanged.** The new Group Discussion is separate.
- **Notifications:** the `notify-users` edge function and `_shared/notifications.ts` (`insertNotifications`) handle the bell plus web push. Cron is `pg_cron` + `pg_net` + vault; see `cron.schedule('push_reminders_every_10min', …)` and `invoke_push_reminders()` in the migrations for the pattern.
- **In-app guide:** `frontend/public/guides/app-guide/content.js` (roles → sections → tasks with q, keywords, steps, result, tips, shot). Update it for anything user-facing. Screenshots are in `shots/` at 390×844 @1.5× JPEG.

## 4. FEATURE 1: FOF Planner (build first)

### Agreed behaviour (final, after several rounds with the user)
- **The cycle is 17 weeks:** 3 weeks **rest**, 3 **mobilisation**, 10 **classes** (Sundays), and 1 **spare week**. The spare week is the buffer and is what makes it 17. There are **3 cycles a year**. Don't show a separate "spare week in the year".
- **The admin Planner page** is a year timeline. Each cohort is a colour-coded bar (rest grey, mobilisation yellow, classes orange, spare teal). There's a year switcher. Cards: *Right now* (e.g. "Cohort 10 · Class 4 of 10"), *Next up*, *Public holidays (N · updated X ago · Refresh now)*, *Needs a decision (clashes)*.
- **Public holidays (Nigeria)** show on the timeline as **information only. They never clash.** Church may still hold services and FOF on those days, e.g. Easter. They're pulled from a public source, **auto-refreshed every 2 weeks**, with a **Refresh now** button. Eid dates are estimates until the government announces them, so mark them "*". Candidate sources, to verify before relying on one: `https://date.nager.at/api/v3/PublicHolidays/{year}/NG` (check NG is supported), or Google's public Nigerian holiday calendar ICS. Store the results in a table, not live-fetched in the browser.
- **Church events:** an admin adds them (name, from/to date) with a **"Stops FOF"** switch. Only events with Stops FOF on create **clashes**, and only when they land on a class Sunday. Events without it just show on the timeline, e.g. "Convention · FOF runs". The add sheet warns straight away if the dates hit a class.
- **Resolving a clash = push everything back** (user confirmed). The affected class and every later class move one Sunday later.
  - The **spare week absorbs the first shift**, so the end date stays the same.
  - If the spare week is already used, the **end date moves**, and **the following cohorts' rest, mobilisation, classes and spare weeks move back too**, re-flowing through the year.
  - **Always show "What moves" before applying**, and warn when a change pushes into the next cohort or breaks "3 a year".
- **Editing any date re-flows everything after it**, e.g. moving a cohort's first class or a phase start.
- **The schedule, class reminders and the participant app must follow the new class dates automatically.** See the refactor below.

### Mock-ups (agreed designs)
`.sessions/mockups/leadership/p-overview.png` (year view), `p-event.png` (add church event), `p-resolve.png` (push back). The HTML sources are next to them (`planner-v2.html`). The dates in the mock-ups are real: Cohort 10's classes run 11 Oct–13 Dec 2026 with the spare week ending 20 Dec. Cohort 11 has rest from 21 Dec, mobilisation from 11 Jan, and classes Sundays 7 Feb–11 Apr 2027. Cohorts 12 and 13 follow at 17-week steps.

### ⚠️ Critical prerequisite: class dates are derived, not stored
Today every class date is computed as **`Cohort.startDate + (weekNumber − 1) × 7`**, so moving one class is impossible. Places that do this (all must move to a single source of truth):
- **Frontend:** `utils/participantApp.ts` (`weekDayDate`), `utils/recapReleaseTimes.ts`, `pages/SupportAttendancePage.tsx`, and `pages/SupportRecapPage.tsx` (uses `weekDayDate`). Grep for `weekNumber - 1` and `weekDayDate` for anything added since.
- **SQL (live functions from these migrations):** `20260917140000_participant_app_feedback_wrapup.sql`, `20260917150000_participant_app_ai.sql`, `20260921110000_shared_attendance_finalisation.sql`, `20260921120000_attendance_follow_up_tasks.sql`, `20260921130000_attendance_report_notifications.sql`. Always diff against the **live** function bodies, not just the migration files.
- **Edge functions:** `push-reminders` (`recapReleaseTarget` / `manualReleaseTarget` use `startIso + (weekNumber-1)*7`) and `daily-checks` (computes `weekNumber = floor(dayInCohort/7)+1`).

**Suggested approach** (explain it to the user and get go first):
1. Add `"Week"."classDate" DATE`, backfilled to `startDate + (weekNumber-1)*7` so nothing changes on day one.
2. Add a SQL helper `week_class_date(week_id)` and a TS helper `classDateFor(week, cohort)` that use `classDate` when it's set, falling back to the formula.
3. Switch every place above to the helpers. Re-deploy `push-reminders` and `daily-checks`. `daily-checks` must find "this week" by the nearest `classDate`, not by arithmetic.
4. Only then build the Planner, which writes `classDate` values and updates `Cohort.endDate`.

Ship and verify this refactor as its own step first: build, check live functions, and confirm reminders still fire. That keeps Cohort 10, which is live now, safe.

### Suggested data model (adjust after reading the code)
- `"CohortPlan"` or columns on `"Cohort"`: `restStart`, `mobilisationStart`, `spareWeekUsed` (boolean/int), `planYear`. The phases can be derived from the first class date. Store overrides only when they're edited.
- `"ChurchEvent"` (id, name, startDate, endDate, stopsFof boolean, createdById, createdAt).
- `"PublicHoliday"` (date, name, isEstimate, source, fetchedAt), unique on (date, name).
- `"PlannerChange"` log (who pushed what, when; before/after dates), so changes can be seen and undone.
- An edge function `refresh-public-holidays`: a pg_cron job every 14 days, plus the admin "Refresh now" button calling it through an admin-checked RPC or the function with an admin check.
- Clash detection is a query: class Sundays (`Week.classDate`) ∩ `ChurchEvent` dates where `stopsFof` = true.

### Where it lives in the UI
An admin-only **Planner** page under Programme in the sidebar, next to Schedule, using `PageHeader.action` for "+ Church event". Add a small "Right now" line to the admin Dashboard if the user agrees. Don't add it to the admin mobile bottom nav (AGENTS.md rule).

### Acceptance checks
- A cohort with no changes shows exactly the same class dates as today everywhere: participant app, attendance, recap releases, reminders.
- Adding a Stops-FOF event on a class Sunday shows a clash. Push back moves classes N…10 by 7 days, uses the spare week, and keeps the end date. A second clash moves the end date and cascades into later cohorts, with a warning first.
- Holidays load for the year, refresh on the button and on the schedule, and never create clashes.

## 5. FEATURE 2: Group Discussion + hub-lead group view (build second)

### Agreed behaviour (final)
- **A private discussion per group:** one **support** and **their group's participants only**. Participants never see other groups or the cohort. Admins can see every group.
- **In a group:** posts, replies, likes, and **Pin** (the support pins; the pinned post sits at the top).
- **Report:** participants get a **subtle** "Report post" (small grey text in the post's ⋯ menu) with a reason: spam or selling / unkind or offensive / not about FOF / something else. Reports go to **the group's support and admins**. The reporter stays anonymous to the poster.
- **Remove:** the **group's support and admins** can remove posts. Everyone sees the neutral **"This post was removed. It didn't follow the community guidelines."** It never says who removed it. **No auto rules** (the user removed them).
- **Hub leads don't handle reports.** Instead, a hub lead opens **a support in their hub** (via `HubMembership` / `SupportHub.leadUserId`, respecting `app_hub_can` for assistants if the user wants) and sees:
  - the group's **meeting day, time and platform** with **Join call**, which opens **outside the app** (a new tab or external app, not inside the PWA) and can be used any time;
  - a **Discussion this week** activity report: posts and replies count, active of N, "quiet 2+ weeks" count, most active names, gone-quiet names;
  - **Read the discussion** (read-only for hub leads).
- **Admins** get the same group view, including Join call, for every group.
- The existing staff **Community** stays as it is.

### Mock-ups (agreed designs)
`.sessions/mockups/leadership/d-participant.png`, `d-support.png`, `d-hublead.png` (HTML source: `discussion-v2.html`).

### Suggested data model and access
- Tables: `"GroupPost"` (id, groupId, authorUserId **or** authorParticipantId, body, pinnedAt, removedAt, removedById, createdAt), `"GroupPostReply"`, `"GroupPostLike"`, `"GroupPostReport"` (postId, reporter, reason, createdAt, resolvedAt, resolution).
- **Participants** use SECURITY DEFINER RPCs with `p_token` (`app_participant_id`), each scoped to the participant's own group via `GroupParticipant`.
- **Supports** only for groups where `Group.supportId` = them. **Hub leads** read-only for groups whose support is in a hub they lead in that cohort. **Admins** everything.
- Removed posts return a placeholder, never the original text, to anyone except admins and the support.
- Notifications: consider notifying the support of new posts and reports, and participants of replies to their posts, via `notify-users`. **Ask the user** about the defaults.

### Open questions to confirm before building
- Can participants edit or delete their own posts? Are photos allowed, or text only at first?
- Notification defaults (see above).
- Where the Discussion sits in the participant nav: a tab on **My Group**, or its own item? Where it sits for supports: a tab on **Group**?
- Can hub-lead assistants (`assistantLeadUserId`) see the group view too?

### Acceptance checks
- A participant sees only their group. They can post, reply, like and report (subtly). They can't see other groups or who reported.
- A support can pin, keep or remove, and sees reports for their group only.
- A hub lead sees only their hub's supports' groups (read-only), with a working Join call and the activity report.
- An admin sees all.
- Verify with the fake-session Playwright recipe for **each role**, and check that the RPCs reject the wrong role or group with a fake or other token.

## 6. Suggested build order (each step shippable on its own, with user sign-off between)
1. Class-date refactor (`Week.classDate` + helpers + switch every usage + redeploy `push-reminders` and `daily-checks`). No visible change.
2. Planner read-only: timeline, phases, cards.
3. Public holidays table + refresh edge function + cron + Refresh now.
4. Church events + clash detection + push-back with "What moves" + change log.
5. Hub-lead / admin group view with Join call (quick win; uses existing Group fields).
6. Group Discussion tables and RPCs, then the participant UI, then the support moderation UI, then the hub-lead activity report.
7. Update the app guide (`content.js`) and screenshots; add session notes.

Show mock-ups or screenshots and get a go before each UI step. Push to `main` only when told.

## 7. Parked (don't start)
- Participant onboarding beyond the walkthrough: `.sessions/2026-09-29_planner-discussion-onboarding-brief.md` §3.
- Survey builder: `.sessions/2026-09-29_survey-builder-brief.md`.
- Jitsi calls (free meet.jit.si, opening outside the app): `.sessions/2026-09-29_jitsi-calls-brief.md`.

## 8. Other open items from this session
- An open question to the user: should ⋮ **Send email** on follow-up cards keep opening the templates, or open the login details for people at Registered or Login shared?
- 13 merged branches for the user to delete on GitHub. The list is in `.sessions/2026-09-29_test-accounts-and-contacts.md`, plus `claude/guide-search`.
- The user should rotate the DB password and access token that were pasted in chat during an earlier session.
