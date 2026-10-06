# Session: Admin checklist tasks for supports

**Date:** 2026-10-06
**Branch:** main

## What Was Done
- Admins add a task to supports' weekly checklists from the Schedule page `⋮` menu ("Add task for supports"): task text, optional due day, weeks (this week or more), and who (everyone, a tag such as Teen Support, or chosen people). Supports are resolved when added; later joiners do not get it.
- Supports see a "From admin" pill and "Due <day>"; they can tick an admin task but not rename, move or delete it (database guard). Ticking asks for an optional note (Done works empty); the note shows under the task and to the admin.
- Support Home: the checklist box is open when there is anything on the list, shows 3 items (open first, admin tasks first, soonest due day), and "View all" opens the Checklist tab. They can tick from Home.
- Admin pop-up also lists "Already added" for the week with who has done it and their notes, and Remove (this week or every week).
- Bell alert per support when a task is added.

## Files Changed
- `supabase/migrations/20261006210000_support_admin_checklist_tasks.sql` (columns, guard trigger, 3 RPCs); applied live
- `frontend/src/components/schedule/{AdminSupportTaskModal,TaskNoteSheet,ChecklistTaskMeta}.tsx`, `utils/checklist.ts`, `pages/{AdminSchedulePage,SupportSchedulePage,SupportHomePage}.tsx`, `services/{supabase-api,api}.ts`, `types/index.ts`
- `FLOW_MAP.md` rule 21

## Key Decisions & Patterns
- Guard trigger is SECURITY INVOKER (current_user must be the caller's role); the admin RPCs run as owner so they pass.
- Programme week runs Sunday to Saturday, so due days use `PROGRAM_DAY_ORDER`.

## Backend / Handoff Notes
- 24 database checks in a rolled-back transaction (fan-out counts, duplicates skipped, tag/people targets, later joiner excluded, guard as a support, admin delete) and Playwright checks (admin pop-up, support Home and Checklist tab, notes sheet) all passed; writes were mocked, no live data written.

## Pending Tasks
- Push reminders for tasks (due day is shown only); editing a task (remove and re-add); alerting admins when a note is written.
- Teens steps 3 and 4 still to build (see 2026-10-06_teens-step-2-review-handover.md).
