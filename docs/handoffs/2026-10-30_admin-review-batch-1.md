# Admin review, batch 1: safer announcements, faster Supports, Scriptures and Users

Date: 2026-10-30. FLOW_MAP rules 122 and 123. The first batch of the suggestions in the admin pages review.

## What changed
- **Announcements (rule 122).** `send-announcement` had no check on who called it. Now it accepts:
  - the project's service key (push-reminders' survey announcements);
  - an admin or Team member session (`x-session-token`, `app_staff` role ADMIN).
  - Everyone else gets 401 or 403.
- **Recipients are worked out before the row is saved.** An admin send that would reach nobody gets 400
  `NO_RECIPIENTS` and saves nothing. This is the kind of send that produced the 0-recipient "CHECK UP ON YOUR
  PARTICIPANTS" post.
  - Exceptions: server sends, and Home-pinned posts (`allowEmpty`, which people see when they sign in).
  - A failed participant read is now an error, not a count of 0.
- **`dryRun` counts recipients.** The composer shows "Goes to N supports and admins and M participants" and turns
  Send off when that is nobody.
  - If the count fails it says "Could not count who gets this" and Send stays on.
  - The count does not clear the app's kept reads.
  - Send now shows the server's own error text.
- **Resource notices** skip an empty audience (an empty hub, no participants yet) and still send the rest.
- **Supports page:**
  - "Last active" for everyone comes from one call (`users_last_active`) instead of one request per support.
  - Only unarchived follow-up contacts are read.
  - Live refreshes reload the page at most every 30 seconds. One inside that window waits for it to end; it is not
    dropped.
- **Scriptures page:**
  - Shows small previews, `scriptures/thumbs/<same file name>` in the `resources` bucket (about 30 KB each).
  - Tapping a design opens it full size.
  - New uploads make the preview in the browser; replacing or removing a design removes its preview.
  - Without a preview the page falls back to the full design. Participants still get full designs.
- **Users page:** shows 25 rows at a time with "Show next 25". Measured, the list loads in about 1 s now; the 20 s
  in the review came from a slow test run.
- **Dashboard and Planner "Right now":** "Class 2 of 10 done · Class 3 on Sun 1 Nov" (was "Class 2 of 10 · Next class
  Sun 1 Nov"). On a class day it reads "Class 3 of 10 · Class today".

## Live changes
- `20261030170000_users_last_active.sql` applied live.
- `send-announcement` deployed as v29, then v30 after the review fixes. `verify_jwt` is still on.
- 84 preview images uploaded to `resources/scriptures/thumbs/` for the existing designs (2.6 MB in total; the
  originals are 14 MB). The originals were not touched.

## Tested
- Live, against v30:
  - no session gives 401 and a bad session 401;
  - a dry run for Cohort 10 gives 49 supports and 80 participants (the admin session and the service key agree);
  - an empty label gives `NO_RECIPIENTS`;
  - the `Announcement` count stayed at 42 throughout.
- In the browser as the test admin (real sends blocked in the test):
  - the reach line shows;
  - Scriptures loads 62 previews and no full designs until one is tapped;
  - Users shows 25 rows, then 50;
  - Right now reads as above;
  - no console errors.
- `npm run build` passes, and the type check shows only the 7 errors that were already there. The lint errors on
  changed files (`any` in `UserManagement.tsx` and `lib/supabase.ts`) are older ones.

## Open items
- The rest of the review's suggestions come in later batches (see the review doc).
- Old test accounts on the Users page still need marking as test (the owner decides).

## Gotchas
- The audience values are `SUPPORTS`, `PARTICIPANTS` and `EVERYONE` (not `BOTH`).
- A new announcement caller must send an admin session, or the service key from a server function.
