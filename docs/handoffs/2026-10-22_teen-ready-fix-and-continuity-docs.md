# Teen card readiness fix, continuity docs audit

Date: 2026-10-22.

## Shipped

- **Teen cards said "Not ready for class" for every teen.** On a Teen Support's My Group > Teens, the page only passed each person's Get ready progress to non-teen groups, so `ParticipantCard` never knew a teen was ready and never showed the "Help them finish: …" next step. `SupportParticipantsPage` now passes `onboardingByPerson` for teen groups too; the group-level onboarding (support steps, progress bar) stays hidden for teen groups. `group_onboarding_progress` already returned teen group members, so no database change. FLOW_MAP rule 22 updated.
- **README** corrected: the full tech stack (Resend, Telegram, OpenRouter, Google Form/Sheet + Apps Script, Microsoft Clarity, pg_cron, GitHub Actions), Node 20.19+/22.12+ (Vite 7), keep-alive is a GitHub Action (not cron-job.org), the repo folder name, the app's several names, a "Start here" table, which root files are historical, and the current contributing steps (hooks, Flow-Map line, handoffs).
- **HANDOVER.md** updated: handoffs live in `docs/handoffs/` (not `.sessions/`), cron-job.org / form-owner Google account / Clarity added to the accounts list, all 8 database cron jobs, how daily checks and Telegram are triggered, and the function drift below.
- Teen Support picture guides (5 PNGs) were made from the app run against a mocked backend; not in the repo.

## Live changes

None. No migration, no function deploy.

## Found, not changed (decisions for the owner)

- **Function drift (22 Oct):** the "Roles and permissions, phase 1" function changes (`cb65c72`, 10 Oct) were never deployed to `daily-checks`, `notify-followup-issue`, `notify-followup-terminal-status`, `notify-group-meeting-completed`, `notify-onboarding-event`, `notify-users`, `run-followup-assignment` (and part of `receive-form-registration`). Live, those notify admins only; deployed, they also notify Team members whose roles include the area. `module_viewers` is live. Two active Team members exist. Details in `HANDOVER.md` section 8.
- **`send-notification`** is deployed (v24, last changed Oct 2025) but not in the repo and not called by the app or the database.
- **cron-job.org** runs `daily-checks`; that account was not in the handover list before.
- `supabase-schema.sql` + replaying all migrations is not a tested rebuild path; the nightly backup restore check is.

## Checked

- `npm run build` and `tsc --noEmit` pass. The Teens tab checked in the browser against a mocked backend: completed teens show "Ready for class", others "Not ready" with their next step.
- Backup, restore check and keep-alive GitHub Actions green on 21 and 22 Oct.
