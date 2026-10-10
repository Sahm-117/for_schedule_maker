# Session: Corporate prayers templates, hub audience, wizard, practice test prayer

**Date:** 2026-10-14
**Branch:** main (commits 64e76c1, 4913c9d pushed)
**Session ID:** 4468cc92-de9f-4881-81b8-74007fbc6527

## What Was Done
- Next-class card on participant Home: whole card opens the class; teacher chip keeps its own tap.
- Practice pop-up bug: cause was test accounts being skipped by the prayer functions. Test accounts now count in the Practice cohort only. Verified against the live backend (banner, live pop-up, support in Practice).
- Corporate prayers reworked: a slot is a template (stacked library verses picked by title + optional faith project; verses fixed, person rotates); audience by hub (everyone or chosen hubs); same person for all hubs or a different person per hub; LIVE slots carry their own Telegram link, wait and message; hub cannot be in two active slots at the exact same time.
- Admin UI: five-step slot wizard with summary, verse titles, `@`/Insert placeholder menu (`{{Name}}` = full name as written), bullets and spacing, bulk add format changed (`===` separator, `Title:` and `Ref:` lines), Live tab now lists live slots.
- Practice page ⋮ menu: "Send test prayer" / "Send test live prayer" (admin only; 30-minute test for the admin's practice participants and the admin, one real push to the admin).
- A verse that is in a slot's template cannot be switched off (message names the slot).
- Code review run; fixed PrayPage session race, blank screen case, `$` in names.

## Files Changed
supabase/migrations/20261014100000_corporate_prayers_templates.sql, 20261014200000_prayer_verse_switch_off_guard.sql (both applied live); frontend corporatePrayers components, AdminCorporatePrayersPage, AdminPracticePage, PrayPage, StaffApp, NextClassCard, supabase-api, types, prayerText; FLOW_MAP.md rule 54.

## Key Decisions & Patterns
- Hub clash checked at exact same time only (near-miss overlap deliberately not blocked).
- `prayer_caller(p_token, p_cohort)`: a support in Practice passes the Practice cohort; signal takes the cohort.
- Test sessions use a hidden `isTest` slot, never run by the clock.
- Old unused function `set_corporate_prayer_settings` and `saveSettings` left in place.

## Backend / Handoff Notes
Both migrations are live. Old test slot (3:13 pm, Practice) and its test day were deleted with approval. The saved test logins in .env.test.local are out of date (admin email matches no user; support email is Olamide's own account, password changed). Playwright used a temporary 3-hour session row, since deleted.

## Pending Tasks
- Confirm the site deployed the new screens (GitHub's newest deployment record was still the previous commit).
- Press "Send test prayer" on the Practice page to check the real push on a phone (not tested).
- Refresh .env.test.local credentials.

## Errors Hit & Fixes
Push hook required a `Flow-Map:` line and a FLOW_MAP.md update; rule 54 updated and commits reworded.
