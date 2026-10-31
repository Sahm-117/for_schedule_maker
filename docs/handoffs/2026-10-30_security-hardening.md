# Security hardening: sign-in limits, locked storage, private files, reminders job, browser headers

Date: 2026-10-30. FLOW_MAP rules 128 and 129, and the section 5 table. Follows the security check written up in the
primer (`2026-10-30_security-review-primer.md`); the owner chose to fix all four items it found.

## What changed
- **Reminders job:** `push-reminders` (v62) now has `verify_jwt` on and only runs for the service role, which is
  what `invoke_push_reminders` sends (its vault key `push_reminders_service_key`). **Always deploy it with
  `verify_jwt` on**: the code trusts the token's role.
  - Note: the function's `SUPABASE_SERVICE_ROLE_KEY` env value is **not** the same string as that key. Comparing
    the bearer to the env value refused the schedule (v60, live for about 3 minutes, no run missed). Check the
    token's role instead, with `verify_jwt` on.
- **Sign-in limits (rule 128):**
  - 10 wrong passwords for one account within 15 minutes pause it for 15 minutes.
    - A staff account has one budget, whether they type an email or a phone number, and `change_own_password`
      shares it.
    - Participants count by phone number.
    - A new password (a reset by an admin or support) lifts the pause straight away.
  - The old checks are renamed `*_check` and wrapped. They, `login_user` and the helpers are closed to `anon` and
    `authenticated`.
  - The sign-in page explains the pause.
- **Storage (rule 129):**
  - **`resources` bucket:**
    - uploading needs a signed-in session (`storage_signed_in`);
    - replacing, deleting and listing need staff;
    - public links still work.
  - **`private-files` bucket (new, private):**
    - new Resource files go here, stored as `fof-private:<path>`;
    - screens get two-hour signed links from `file-links` (new function, v1), which asks `private_file_paths`
      what the caller may see;
    - `public-api` v7 (API 1.1.1) signs them for church apps.
  - `resource_versions` now returns each entry's `id`.
- **Browser headers:** `vercel.json` adds `X-Frame-Options: SAMEORIGIN` (the app frames its own guides),
  `X-Content-Type-Options: nosniff` and `Referrer-Policy: strict-origin-when-cross-origin`.
- **Primer:** the Security section lists these as in place.

## Live changes
- Migrations applied live:
  - `20261030180000_sign_in_limits.sql`;
  - `20261030190000_storage_locked_private_files.sql`. Its upload rule first called a function closed to the app's
    roles, which refused uploads for about 3 minutes, with no uploads in that window. It was fixed with
    `storage_signed_in`, and the file holds the final version;
  - `20261030200000_sign_in_limits_per_account.sql` (after the code review: per-account counting, reset clears the
    pause, an index for the clean-up, and the prefix by length).
- Functions deployed:
  - `push-reminders` v60, v61, then v62 (the last only adds a code comment);
  - `file-links` v1;
  - `public-api` v6, v7, then v8 (a 500 instead of empty links if signing fails).

## Tested (live)
- **Reminders:** a call with no key gets 401, the public key 403, and the service role 200 (a dry run).
- **Sign-in:**
  - the eleventh wrong try is refused with `TOO_MANY_ATTEMPTS`, and other logins are unaffected;
  - a correct password clears the count, and email case is ignored;
  - the page message was checked in the browser.
- **Storage:**
  - uploads with no session are refused, and admin and participant uploads work;
  - a participant can't delete, and an admin can;
  - public scripture links still open;
  - `private-files` can't be read without a link, and admins can upload, read and delete.
- Every test file, session and throttle row was removed.

## Existing files moved
- **Files moved:** after the new app was live, the 7 Resource files and 2 earlier versions were copied into
  `private-files/resources/<same name>` (sizes checked), and their rows now point to `fof-private:…`.
  - `file-links` signs all 9 for an admin and none for a participant (none of these are shared with participants),
    and refuses callers who aren't signed in.
  - Checked in the browser: previews load, and a PDF opens in the viewer.
- **Old public copies removed, with the owner's go-ahead:** the 9 moved files plus 5 unused top-level documents
  (old Faith Project Guide PDFs, two spreadsheets, a week 1 schedule). They are in the 30 Oct encrypted backup, and
  the old links now return an error, with nothing cached.

## Open items
- Survey uploads (`survey-files/…`) still go to the public bucket. None exist yet; move them to `private-files`
  before surveys collect files.
- Installed phone apps on an older version open private files only after they update (Refresh, or the update
  banner).

## Gotchas
- Storage policies see the app's `x-session-token` header, so `app_is_staff()` and friends work in them. Anything
  they call must be executable by `anon`.
- Policies on `storage.objects` can be changed (`ALTER POLICY … USING`) but not renamed; only storage's owner can
  rename them.
- Deleting from a private bucket needs a SELECT policy as well.
