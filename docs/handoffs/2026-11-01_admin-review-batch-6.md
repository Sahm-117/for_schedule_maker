# Admin review, batch 6: Supports in one call, reopen reason, website change history, private survey uploads

Date: 2026-11-01. Four live migrations and one function deploy (`file-links` v2, verify_jwt on). Batch 5 is in
commits `d5918f2` and `b6d0343` (rota fill, the feedback prompt after class 3, all of this week's birthday graphics).

## Live changes (applied 1 Nov, in one transaction)
1. `20261101100000_attendance_reopen_reason.sql`
   - `AttendanceSession."reopenReason"` holds the reason.
   - New `reopen_shared_attendance(week, reason)`:
     - admin only, and the reason is required;
     - refuses with "Attendance is already open" unless the register is finalised;
     - then tells the cohort's group supports (bell + push via `notify-users`). The reason is not in the notice.
   - The old one-argument version still works for app tabs opened before this release, with a placeholder reason.
2. `20261101110000_survey_files_private.sql`
   - New survey uploads go to `private-files` at `survey-files/<survey>/<respondent id>/…`.
   - The upload policy uses `storage_survey_upload_ok(name)`: a real survey, the caller's own id, and no `..`.
   - `survey_respondent_id(token)` gives the app that id.
   - `survey_submit` reads FILE answers as `{url, name}` (a plain string still works). It accepts an old https link, or a private link inside the respondent's own folder.
   - Old public uploads are untouched.
3. `20261101120000_website_section_changes.sql`
   - A trigger on `AppSetting` (`landing_content` and `landing_images` only) records each section's last change and who made it.
   - `website_section_changes()` is admin only. Nothing is back-filled, so a section shows "Changed …" only after its next save.
4. `20261101130000_admin_supports_overview.sql`
   - `admin_supports_overview(cohort)` returns users, members, hubs, memberships, kinds, noted ids, open follow-up load, last active and meeting reports.
   - The page still applies `countsAsCohortSupport` (rule 127). If the call fails, it warns in the console and falls back to the old reads straight away.
   - Health, people, rules, trainings, onboarding and groups are still separate reads.

`file-links` v2 adds a `survey` kind (admins only, `survey-files/` only, no `..`). Survey results sign their links through it, like Resources (rule 129). A link that can't be signed still lists the file, with "Couldn't open the link". CSV and PDF exports write "name (private file, open it in the app)" instead of a link that expires.

## Checks
- **Code review** found 10 issues; all are fixed. Two of them would have broken the feature: every file answer was refused, and the Supports call failed every time because an enum was mixed with `''`.
- **Before applying,** a dry run in a rolled-back transaction called the new functions as an admin: the overview returned all 57 users, and a bad upload path was refused.
- **After applying,** in Playwright as an admin with a temporary session (deleted afterwards):
  - Supports loads through `admin_supports_overview` with no fallback;
  - Website loads its change list;
  - Reopen asks for a reason. The reopen call itself was intercepted, so no register was reopened and nobody was notified. The latest session is still finalised.
  - There were 0 console errors.
- **Not tested end to end:** a participant uploading a survey file, because no participant login was available.

## Not done
- **Birthday graphic to a group or hub chat:** `group_discussion_post` lets only the group's own support post.
- **PostHog dashboard link:** the repo has no dashboard address.
- **5 am scripture:** no change needed. It sends once per person; the Notifications list shows a bell row and the dedupe-claim log line as two entries.
