# Faith projects: save straight, edit any time, opt-out corporate prayer

## Summary
Part 1 of the corporate-prayer work (the spec agreed in chat). The back-and-forth between participant, support and back office is gone.
- A participant writes a faith project and taps **Save**. It is saved at once and can be edited any time (**Save changes**). The
  support is bell + push notified on a first save and on every change. No submit, review, comments or approval any more.
- **Edit history** (an accordion) shows every saved version, full text, newest first, with who and when. The participant, their
  support and the admin all see it.
- Corporate prayer is **opt-out**. Admin picks the week it starts (Faith Project settings, per cohort) and how many days before it the
  pop-up begins (default 3). Every participant then gets a pop-up they cannot close, only answer: "I'm fine with this" or "Opt out".
  The Faith page keeps an **Include in corporate prayers** switch (default on) to change the answer later.
- Old projects: every one with text became `SAVED`; old comments and approvals are hidden, nothing deleted.
- FLOW_MAP rules 49 and 50.

## Live changes
Migration (applied live): `20261010100000_faith_project_free_edit.sql`
- New: `Participant."prayerConsent"` / `"prayerConsentAt"`; `FaithProjectSetting."prayersStartWeekNumber"` / `"prayerPopupDaysBefore"`;
  table `FaithProjectVersion` (staff read policy) and trigger `faith_project_keep_version_ins` / `_upd`; functions
  `faith_prayers_start_date`, `faith_prayers_started`, `faith_prayers_prompt_due`, `faith_project_prayable`, `set_prayer_consent`.
- Rewritten from their live definitions: `save_faith_project`, `participant_faith`, `set_faith_project_prayer_share` (now delegates),
  `hub_prayer_list`, `set_hub_prayer_focus`, `participant_home`, `practice_make_group`, `practice_reset_participant`.
- Backfill: 64 projects with text became `SAVED` (10 without text `NOT_DRAFTED`), each with one baseline version.
No edge function was deployed or removed. `notify-faith-project-submitted` and `notify-faith-project-review` are no longer called but
are still deployed; deleting them needs explicit approval.

## Decisions and why
- Status is only `NOT_DRAFTED` / `SAVED`; consent lives on the participant (not the project) so someone without a project can answer.
- Everyone sees the pop-up once (including people who had switched sharing on before), and counts as included until they answer.
- Prayable = SAVED + text + not opted out + (said yes / already shared, or prayers have started). So nothing is shared before the
  start week unless the person said yes; the 37 people shared before are still shared.
- One shared project went from not shared to shared: 38 are prayable now versus 37 "approved and shared" before (a shared flag that had
  been set on a project that was not approved).
- Supports and admins can no longer edit the project text; the optional category stays.

## How it was tested
Rolled-back SQL with a real participant session: same text changes nothing; an edit makes one new version; empty text is refused;
history and consent come back; opt-out hides the project, opt-in shows it; the pop-up shows only inside the "days before" window and
never when no start week is set. Browser tests with a mocked backend: participant Faith page (new, saved, edit, history, switch),
the blocking pop-up (still there after Escape and an outside tap; Opt out clears it and flips the switch), the support's project
sheet (read-only, category, history), the admin Faith projects page, project modal and settings. Not run against the deployed backend
with real logins.

## Open items
- Dead code left in place on purpose: `utils/faithThread.ts`, `faithThreadReadsApi`, `faithProjectsApi.upsertForParticipant`, the
  two edge functions above, `faithUnread` in `participant_home`. Remove only with approval.
- Hub prayer pages still say "shared for prayer"; the text is fine but could say "corporate prayers".
- Parts 2 to 4 of the spec (Corporate Prayers admin module, the prayer slot screen with live counts, the 9pm Telegram pop-up) are not built.

## Gotchas
- `npx tsc --noEmit -p .` checks nothing here (the root tsconfig has no files). Use `npx tsc --noEmit -p tsconfig.app.json`; it has about
  27 older errors in files unrelated to this work, and `npm run build` (vite) does not type-check.
