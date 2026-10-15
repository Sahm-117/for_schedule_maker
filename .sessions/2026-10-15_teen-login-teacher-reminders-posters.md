# Session: Teens back in the app, teen teacher, reminders off, conversation starters, hub readiness posters

**Date:** 2026-10-14 to 2026-10-15
**Branch:** main (pushed up to `6679a0a`; nothing local waiting)

## What Was Done
- **Teen Support sees their teens** on My Group and Home: the support-group lookup skipped teen groups (FLOW_MAP rule 22 text updated). Teen groups show Discussion and People, no Group meetings tab.
- **Teens back in the app (rule 67):** Teen Welcome gate removed; guardian signs in first; a Teen Support can add a teen's own number (alias of the same login and password, locked until the guardian has chosen a password); several teens on one guardian number get a "Who is this?" picker. Migration `20261017100000_teen_login_phone.sql` (applied live after a rolled-back 20-check run). Edit/bin icons for the own-number row. Designs made in a Design canvas (images sent; the canvas does not open on iPhone).
- **Admin discussion includes teens:** `20261017110000_discussion_summary_with_teen_groups.sql` (applied live); teen cards on the admin Groups page open the group and discussion.
- **Smaller UI:** Users card on phones (role chips under the details); "Access confirmed / Not signed in yet" chip on admin Groups and My Group (rule 68); Faith project chip opens a popover (rule 69); Back returns to the scroll position (rule 70); week editor shows the real manual date (Thu 22 Oct for Week 2, which is on 25 Oct).
- **Conversation starters (rule 71):** type "/" or tap the "/" button in the group message box (group's support only); 14 starters plus today's scripture; scripture picture links show as pictures in discussion posts.
- **Teen teacher (rule 72):** teen teacher fields on each class, Adults/Teens switch in the week editor; teens and Teen Supports see the teen teacher (blank falls back to the main teacher). `20261017120000_teen_class_teacher.sql` and `20261017130000_teen_age_variants.sql` (`fof_is_teen_age`) applied live.
- **Follow-up reminders off once the cohort has started (rule 73):** `push-reminders` v51 (8 am push and the 4-a-day "No activity" nudges). Deployed from a live-matching build (the undeployed roles change was left out).
- **Announcement alerts (rule 74):** subject is the title, message the body; `send-announcement` v25. Also drafted a 200-character popup message for a church service notice.
- Two code reviews run and their findings fixed (slash menu, stale chips, back scroll, popover flash, teen age test, and others).
- Support asks answered: an Android install that crashes on launch (browser works; use a Chrome shortcut), existing teens' state (counts only), accountability posters (images, not in the repo) of every group by hub with hub lead, assistant and IT support.

## Backend / Handoff Notes
- Live: migrations 20261017100000, 110000, 120000, 130000; `push-reminders` v51; `send-announcement` v25. Handoff `docs/handoffs/2026-10-17_teen-login-and-family.md` and `2026-10-15_*` files cover them.
- The repo's `push-reminders` contains the roles-and-permissions change that is still not deployed; a later deploy of the repo copy ships it.
- Deploying edge functions: the Management API deploy endpoint works (multipart, files keyed `supabase/functions/...`).

## Pending Tasks
- Check tomorrow morning that no one gets the 8 am "Follow-ups need attention" push (it cannot be dry-run tested).
- Test teen login end to end with a real guardian account after the first guardian signs in.
- Teens see the normal participant Home (Get ready steps, participant reminders); trim for teens if it confuses them.
- Open follow-ups remain (a few unregistered adult prospects, teens); decide whether they move to the next cohort.
- Group 18 has no support or participants.
- The four participant backup files under `.sessions/backups/` (personal data) are still in the repo history; needs approval to remove.
- The Stop hook's re-author demand is declined every time (commits stay authored by Sam).

## Errors Hit & Fixes
- `pkill -f vite` killed the shell when the pattern matched its own command; use `pkill -f "[v]ite ..."`.
- My first teen-support mock test failed on incomplete mocks (popup queue, onboarding RPC shape); fixed the mocks, not the app.
