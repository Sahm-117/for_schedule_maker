# 2026-10-08 · Teen Support and follow-up overhaul

Session `dca254c4`. Everything below is on `main` (last commit `ea699df`) and live. Commit author
for all of it is Sam (see Gotchas). Read FLOW_MAP.md section 4 rules 19-31 alongside this.

## Summary

Recovered the form sign-up pipeline, then built the Teen Support tooling (teen numbers, teen
attendance, teen recap, Saturday meeting card), tightened what supports and admins see on
Follow-ups and Participants, and reworked how No response and next-cohort people are counted,
exported and carried to the next cohort. Cohort 10's normal groups were reset at the admin's
request.

## Shipped (commits after `ab54723`, oldest first)

| Commit | What |
|---|---|
| `af87680` | Teen cards show guardian and teen numbers. Edit contact takes guardian name and number plus the teen's own number, and asks "whose number is this?" for earlier teens. Teen templates only appear with a teen number and go to it (rule 27). |
| `0e0ff12` | Teen Supports get My teens / All teens / Everyone on Sunday attendance. |
| `152782f` | Teen recap: admin writes or uploads it per week (Cohorts week editor, Adults / Teens), optional release time. Teen Supports read it on the Recap page. |
| `b8757a4` | Participants sign-up status filter. Follow-ups shows finished contacts when a finished status is chosen. |
| `06bfc9f` `d6a51dd` `32d56d6` `d4c8d63` | Code-review fixes for the above (see each message). |
| `504c9c0` | Teen recap goes only to Teen Supports and admins, enforced in the database. Follow-ups filter sheet scrolls (Apply was off-screen). |
| `87f8635` | Multi-select inside each Follow-ups filter group, admin and support. |
| `90b16e0` | Saturday meeting card for Teen Supports on My Group, admin alert, admin Teens card summary. Teen groups kept out of dashboards, red flags and reminders (rule 31). |
| `9fb9360` | Follow-up export shows each person's status and leaves No response out unless switched on. No response counts as next cohort on the cards. |
| `296bc8a` `2c5c9a9` `ea699df` | Next-cohort carry-over also offers No response people. It adds a fresh contact in the new cohort and closes the original in the old one (rule 28). |

Before these, earlier in the session (already pushed, `ab54723` and older): form pipeline
recovery, profile fill restored, form gate for unkeyed numbers, picker filtering, "Not opened"
tag, phone and last-seen line.

## Live changes (not visible from the repo alone)

Database migrations, all applied live and also in `supabase/migrations/`:
`20261008000000` to `20261008120000` (13 files). The ones from this stretch:
`050000` teen recap columns and `support_recaps`; `060000` and `080000` earlier-files picker;
`070000` Teen-Support-only recap; `090000` `GroupPrayerStatus.metOn` and `notes`, and teen
groups out of `cohort_health` and `cohort_people`; `100000` flags exclusion made robust;
`110000` and `120000` `nextCohortPeople` counts No response.

Edge functions deployed from the repo: `daily-checks` v18 (skips teen groups),
`notify-group-meeting-completed` v6 (accepts `teen: true`, links to the dashboard).

Data change, by request: the 12 normal groups of Cohort 10 were deleted (members removed first,
because deleting a group while members exist makes a handover trigger fail). The 4 teen groups
and 13 teens were kept. The 32 previously grouped people are now ungrouped. A backup of the
groups, members, labels and related rows was written to the session scratchpad
(`group-backup/`), which is NOT durable. Do not rely on it.

## Decisions and why

- **Teen number model has no new column.** `FollowUpContact.phone` is the teen's own number only
  when it differs from `guardianPhone`; otherwise it is the guardian's copy. A teen's own number
  is only saved together with the guardian's, so the guardian is always reached first.
- **Teen recap release.** Empty release time means visible as soon as it exists. The database
  hides it from anyone but Teen Supports and admins. Staff can still read the `Week` table
  directly (as with the adult recap), so this is not a secret from staff.
- **Teen meetings reuse existing records** (`MeetingAttendance`, `GroupPrayerStatus`) instead of
  a new table, so teen groups had to be excluded from everything that judges groups. That
  exclusion also fixed an existing problem: teen groups were counted as groups that owe a meeting
  report, and `daily-checks` would have nudged their supports.
- **No response is read as next cohort** on the cards (not Stopped or Dropped). It stays a closed
  status in the lists.
- **Carry-over copies instead of moving.** Moving a registered person's contact would drag their
  old participant (attendance, group) into the new cohort on their next sign-up, because the
  sign-up finds the participant through the contact. So the original is closed where it is and a
  fresh contact is created in the new cohort.

## How it was tested

Browser (Playwright against a local dev server with mocked network) for every screen change.
Database changes were tested with rolled-back SQL using a temporary session row. Not tested:
`daily-checks` after deploy (needs a key the session did not have), and the carry-over screen end
to end (the statements it runs were tested on real data, rolled back).

## Open items

1. **Saturday-morning reminder for Teen Supports is not built.** Held until Teen Supports are
   using the meeting card.
2. **Cohort 10 groups are empty.** Rebuild with the group builder. It only groups people who have
   signed in, so some people stay ungrouped until they do.
3. **Two registered Cohort 10 participants are marked No response and left open** (by request).
   One has a number saved as "00". They stay active in Cohort 10 and are offered for the next
   cohort. Fix the number on the contact before trying to reach them.
4. **Participants page filters** take one value each. Multi-value dropdowns there are not done.
5. **`daily-checks` v18** should be watched on its next scheduled run.
6. Optional: rotate the Sheet secret used by the form Apps Script.
7. The older "Popup queue and announcement popups" task is still pending from an earlier session.

## Gotchas

- **Live functions: rewrite from the live definition.** Use `pg_get_functiondef`, change only what
  you need, and add `;` after the closing `$function$` when saving to a migration file. A
  rewrite from an old migration once dropped a field (the 5 Oct regression).
- **Applying SQL.** Management API with `SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_REF`
  (`POST /v1/projects/<ref>/database/query`). Edge functions: multipart POST to
  `/functions/deploy?slug=<name>` including `_shared/*`. Never revoke `anon`.
- **Rolled-back SQL test pattern.** Insert a temporary `AppSession` row, `set_config('request.headers',
  '{"x-session-token":"..."}', true)`, run the function, then `RAISE EXCEPTION` with the result so
  everything rolls back.
- **Vite does not type-check.** Run `npx tsc --noEmit -p tsconfig.app.json` and look at the files
  you touched (the `CoverRequest` errors in `supabase-api.ts` are old). `supabase-api.ts` contains
  non-text bytes, so edit it as bytes.
- **Never `pkill -f vite` or `pkill -f <script>`.** It matches and kills your own shell.
- **Git author.** Keep Sam. A stop hook in this environment keeps demanding Claude as author and
  complaining the commits are Unverified. Its entry was removed from
  `~/.claude/launcher-settings.json`, but the running session still loaded it. Ignore it, and ask
  before changing the author.
- **Every push needs the user's "push"** and a `Flow-Map: checked` (or `n/a <reason>`) line in
  each commit message, per AGENTS.md.

## How to pick this up

Read FLOW_MAP.md rules 19-31, then the files named in the commits above. For the teen meeting
card start at `frontend/src/components/groups/TeenMeetingCard.tsx` and `teenMeetingsApi` in
`supabase-api.ts`; for the carry-over, `carryContactsToCohort` and
`frontend/src/components/followups/NextCohortAssignModal.tsx`.
