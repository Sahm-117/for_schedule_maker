# Late counts as attended everywhere; Realtime feed off; empty announcement removed

Date: 2026-10-30. FLOW_MAP rules 12 and 118.

## What changed
- **Only Absent is a missed class (owner's decision).** Late and Left early count as attended everywhere. Excused is
  neither attended nor missed, and it is left out of the completion percentage.
  - Frontend: `sundayMarkAttended` (Present, Late, Left early) and the new `sundayMarkMissed` (Absent) in
    `utils/programmeRules.ts`. These drive the "Keep an eye on" chips, the "why" pop-up, the participant's own
    misses check and completion.
  - Wording:
    - the Journey page says "Late (or Left early) — counted as attended";
    - the profile legend and Settings say the same;
    - the health pop-up says only Absent counts.
  - The admin "Excuse lateness (appeal)" action and its pop-up are removed, because an appeal no longer changes
    anything. The `lateExcused` column and `excuse_lateness` stay, and old records keep their notes.
  - Database: `cohort_health`, `hub_group_overview`, `notify_attendance_report` and `api_person_programme` count Late
    and Left early as present.
  - Public API: description updated, and `lateOrLeftEarly` is now "already counted in present".
- **Realtime:** `public."Notification"` removed from the `supabase_realtime` publication, which is now empty. The app
  polls the bell; only broadcast channels remain.
- **Announcement deleted (owner approved):** "CHECK UP ON YOUR PARTICIPANTS" (25 Oct), sent to the label "All
  Supports", which nobody holds, so it reached 0 people. One row, no popups. The empty label itself is untouched.

## Live changes
- `20261030150000_notification_off_realtime.sql` and `20261030160000_late_counts_as_attended.sql` applied live.
- `public-api` deployed as version 5; only `openapi.json` wording changed. Health check passes.
- One `Announcement` row deleted by id.

## Tested
- Both migrations compiled in a rolled-back transaction before applying. After applying, none of the four functions
  reads `lateExcused`, and the publication has 0 tables.
- `npm run build` passes, and the type check shows only the 7 errors that were already there. Lint is clean on the
  changed files.
