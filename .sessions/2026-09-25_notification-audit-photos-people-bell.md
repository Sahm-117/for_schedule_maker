# Session: Notification audit, photos & People, participant bell

**Date:** 2026-09-25
**Branch:** main
**Session ID:** 82ef12de-60cd-425e-9abd-93ed02197635

## What Was Done
Built and shipped post-class feedback feature (Phase 12) with database migrations and testing,Completed notification audit review: assessed all 57 alerts, applied 6 semantic fixes (no em dashes, group meeting wording, alert routing, emoji removal),Deployed 6 server functions with notification updates to live Supabase project,Added Announcements and Activity tabs to participant notification bell, opening on Activity by default,Upgraded photo handling: higher quality storage, tap-to-enlarge full screen, instant display on upload,Shipped People directory: shows support's photo on Home/My Group, displays group members with support marked, hides phone numbers,Modernized Community page: single slim tab bar instead of grey box, Open/Closed toggle moved under tabs, tighter post cards,Fixed cohort switcher to open on Active cohort (ZZ Demo) instead of Cohort 9,Added department choice visibility in admin profile view,Tested all 11 participant logins post-feature; all database migrations verified without data loss; server functions tested with dry runs,Committed 7 commits to main and pushed to GitHub; live site building from latest commit

## Files Changed
supabase/migrations/20260925080000_class_feedback_department_prompt.sql,supabase/migrations/20260925120000_photos_people_directory.sql,supabase/migrations/20260925130000_notification_audit_fixes.sql,supabase/functions/push-reminders/index.ts,supabase/functions/notify-followup-terminal-status/index.ts,supabase/functions/notify-followup-assignment/index.ts,supabase/functions/notify-onboarding-event/index.ts,supabase/functions/send-announcement/index.ts,supabase/functions/receive-form-registration/index.ts,React components for participant home, community page, notification bell, people directory,Settings page (added 'Class starts at' option)

## Key Decisions & Patterns
Participant bell opens on Activity tab by default with unread indicator dot on both tabs,Photos stored at higher quality; tap-to-enlarge opens full-screen view across all contexts (profile, post, people, group),People directory hides participant phone numbers from other participants; shows support with own marked, plus group members,Cohort switcher remembers last selection per browser; defaults to Active cohort when none remembered,Feedback times set to Sunday 12:00 by default; department prompt defaults to Off,All notification alerts standardized: no em dashes, consistent emoji usage, routing to bell vs phone per alert type,Group meeting reminders use 'weekly meeting' language and open My Group › meetings page,Follow-up assignment and terminal status alerts route to Mobilisation › Follow-ups, save to bell

## Backend / Handoff Notes
None

## Pending Tasks
None

## Errors Hit & Fixes
Scriptures page crash: caused by shared server cache between agent's test copy and main dev server; fixed by isolating agent's cache and restarting main server,Participant feedback never prompted: feedback logic always picked last week of course (hasn't happened yet); fixed to pick latest completed class and exclude already-asked weeks,Anonymous feedback traceable: answer timestamps saved with feedback record allowed matching to person; removed timestamps from feedback record,Cohort switcher opened on Cohort 9 instead of Active: fixed to read and respect Active cohort flag on first load
