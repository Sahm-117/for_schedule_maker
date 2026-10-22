# Server functions brought in line with the repo

Date: 2026-10-22. Follows [Teen ready fix, continuity docs](2026-10-22_teen-ready-fix-and-continuity-docs.md).

## Live changes (edge functions, deployed from the repo, verify_jwt unchanged)

`daily-checks` v20, `notify-followup-issue` v15, `notify-followup-terminal-status` v15, `notify-group-meeting-completed` v8, `notify-onboarding-event` v12, `notify-users` v11, `run-followup-assignment` v10, `receive-form-registration` v21, `notify-followup-assignment` v13, `notify-hub` v8, `send-notification` v25 (retired). No migrations.

## What it changes

- The "Roles and permissions, phase 1" function code (`cb65c72`, 10 Oct) is now live. Admin notifications for an area (follow-ups, participants, groups, supports) go to everyone `module_viewers` returns: active admins, plus active Team members whose permission roles can See that area. On 22 Oct that is 8 admins plus: groups 2 more, participants 7 more, supports 4 more, follow-ups 3 more (the 2 Team-member-only users and some supports who also hold the Team member role). To stop someone getting them, take that area off their role in Roles, not in the code.
- `notify-followup-assignment` and `notify-hub` only picked up the newer `_shared/` helpers (named alerts on shared phones).
- `send-notification` (old schedule-approval email/Telegram sender, not called by anything) is retired: its original live v24 code is in the repo, commented out, and the deployed stub returns 410 Gone.

## Checked

- Every live function downloaded again and compared with the repo: all 18 identical.
- All deployed functions answer OPTIONS 200; `send-notification` returns 410.
- The 13:20 UTC cron runs after the deploy (`run-followup-assignment`, `push-reminders`) returned 200 ok.

## Gotchas

- The Management API `logs.all` endpoint is gone; the database's `net._http_response` table is a quick way to see recent cron-to-function responses.
- `send-notification` was in an old package format; `supabase functions download` cannot read it, so the source was taken from the raw body (`/functions/<slug>/body`).
