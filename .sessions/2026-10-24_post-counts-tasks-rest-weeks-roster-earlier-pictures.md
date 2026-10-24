# 2026-10-24 · Post counts, schedule + tasks as one list, rest weeks, Feature of the Day roster, reuse earlier class pictures

Session dca254c4 (the hook's own row for it is the earlier "session cleared" one, written before any work). Handoffs for every change are in `docs/handoffs/` (2026-10-24_scripture-public-counts, _schedule-and-tasks-one-list, _reuse-earlier-class-pictures). FLOW_MAP rules 58 (extended), 21 (pointer), 104 and 105 added.

## What Was Done (all pushed to main: c81c427, 9d8dbd4, f6783e3, b42140d; Vercel deploying)
- **Inspirational post counts for everyone:** participants and supports see all-time likes, downloads and shares beside the three icons (`scripture_public_counts`, read-only, practice and test accounts left out; optimistic bump then re-read from the server). Admin Scriptures page unchanged (it already had totals and a cohort filter).
- **Schedule and checklist merged for supports:** one list per day (activities with a time, tasks with a deadline), filter chips All / Activities / Tasks, header "Add task" sheet (title + optional deadline), "From admin" tag on admin tasks only, Home box renamed "Your tasks".
- **Rest weeks:** `SupportChecklistItem` can have `dueDate` + `cohortId` and no `weekId`; the 3 weeks after a cohort carry follow-up tasks (`restWeeksAfter`, fixed when the task is added). Schedule week picker gets "Rest weeks"; bell alert for dated tasks opens it (`&rest=1`). Admin pop-up gained Rest weeks and a "Group leaders" audience (`admin_add_support_task`, `admin_rest_tasks`).
- **Code review** (high) found 10 issues; all fixed before pushing (alert deep link, task filed in another week now says where, admin pop-up mode kept, add-task guards, shared `scheduleWindow` helper, counts re-read after a tap).
- **Week editor:** "Use an earlier one" for the class graphic and adult/teen teacher photos (`earlierClassImagesApi`, only that kind of picture, nothing re-uploaded); `removeClassImage` no longer deletes a file another week still uses.
- **Feature of the Day roster** (.docx, outside the repo, names inside): 9 Sundays 25 Oct to 20 Dec, one participant feature per class topic; IT supports rotate on Sundays, each hub's IT support takes supports through it that evening, and each group support (22 adult + 5 teen) takes one feature matched to their module, three supports per feature.
- Mock-up of the merged schedule published as a private design artifact.

## Files Changed
`frontend/src`: `pages/SupportSchedulePage.tsx`, `SupportHomePage.tsx`, `AdminSchedulePage.tsx`, `CohortsPage.tsx`; `components/ScriptureActions.tsx`, `schedule/AddTaskSheet.tsx`, `schedule/EarlierImagePicker.tsx`, `schedule/AdminSupportTaskModal.tsx`, `schedule/ChecklistTaskMeta.tsx`; `utils/checklist.ts`; `services/supabase-api.ts`, `api.ts`; `types/index.ts`; `lib/supabase.ts`; `constants/tours.ts`. Migrations `20261024130000_scripture_public_counts.sql`, `20261024140000_support_tasks_deadlines.sql`. `FLOW_MAP.md`, `docs/handoffs/*`.

## Key Decisions & Patterns
- Owner approves every push ("yes, push"); commits authored as Sam with `Flow-Map: checked`. Run /code-review before pushing.
- Activities stay separate from tasks (time, labels, completion overview, "Any notes?"); only tasks merged into the Schedule.
- Live DB work goes through the Management API (`psql` to the pooler times out). Tests that touch notifications run inside a `DO` block that raises at the end so everything rolls back, and only target a user with no Telegram link.
- Dated task alerts: the migration's bell path is `?tab=checklist&rest=1` when any row has no class week.
- "Relevant to the module": the earlier-file picker lists only that module's kind of file.

## Backend / Handoff Notes
- Live: `scripture_public_counts`; `admin_add_support_task`, `admin_rest_tasks`, new columns `dueDate`/`cohortId`, `weekId` optional, guard trigger extended (applied twice, idempotent). No edge functions deployed.
- Not tested with a real support/admin login; "Group leaders" audience was only checked as a read-only query (27 leaders in Cohort 10).

## Pending Tasks
- Roster: owner to name the person managing it; confirm the IT-support rotation order. Names are in the .docx only.
- Earlier-file picker for other uploads (landing images, scriptures, templates) needs a source of earlier files per module; owner to say which.
- Optional: "Remind me the day before" push for tasks (needs a `push-reminders` change); a "Past weeks" tasks list; GitHub reports 6 dependency vulnerabilities on the default branch (not looked at).

## Errors Hit & Fixes
- LibreOffice cannot open any file here, so the roster .docx was validated (validator passes) but not rendered; `docx@9.0.2` produced an unreferenced fontTable (latest version fixed it).
- `pkill -f` and `ps | grep` patterns matched my own shell; stop dev servers by pid.
