# Attendance permission fix (2026-10-17)

- Bug: a support marking attendance got "permission denied for function discussion_participant_group" and nothing saved. Cause: the meeting-window trigger (`fof_meeting_window_guard`, from `20261018110000_meeting_recording_window.sql`) ran as the signed-in user and called that private helper (owner and service role only) whenever the row carried no `groupId`, which is how the app saves attendance. My live tests of that migration ran as the database owner, so they missed it.
- Fix: migration `20261019110000_meeting_window_guard_definer.sql`, **applied live**. The trigger function is now `SECURITY DEFINER` with an empty `search_path`. The window rule itself is unchanged.
- Checked live in rolled-back transactions: before the fix, an insert as the `authenticated` role failed with the same error; after it, a staff session inserts attendance fine, and a support session on a real cohort group is still stopped with `MEETING_WINDOW_CLOSED` outside the window. Not tried from the app itself.
- Anyone who saw the error can simply mark attendance again; no rows were written by the failed attempts.
- Lesson: test database writes as a signed-in user (role `authenticated` plus a temporary session token), not as the owner.
