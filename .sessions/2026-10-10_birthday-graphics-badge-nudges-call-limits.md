# Session: Birthday graphics, inspirational post actions, venue-map and onboarding nudges, readiness badge, groups strip, group call limits

**Date:** 2026-10-10
**Branch:** main

## What Was Done
- **Leadership one-pager** rebuilt light (Montserrat, crest) and exported as an A4 PowerPoint (validated only; LibreOffice could not render in this sandbox).
- **Birthday graphic** on the admin Birthdays page: "Next up" suggestion plus a balloon button per row; canvas template (orange gradient, "HAPPY BIRTHDAY" wall, tilted card, pill photo, date badge, role pill, name banner, quote bottom left, "The Covenant Nation / Ikorodu" footer, Montserrat, no dashes). Download and Share. `birthdays_list` now returns `avatarUrl` (migration, live).
- **Inspirational posts**: quiet Like / Download / Share icons on participant and support Home; `ScriptureEngagement` table and three functions (migration, live); admin Scriptures page shows totals and per-post counts with a cohort filter (second migration, live). Counts leave out practice and test accounts.
- **Venue-map reminders** in `push-reminders`: Saturday 5 pm and 8 pm, Sunday 6 am, first two Sundays from the cohort start; `/me?map=1` opens the map. **One-off onboarding nudges** for 10 Oct (6 pm intro/support-first wording, 8 pm open steps; 7 pm skipped that day). Function deployed v42 to v49.
- **FOF N Readiness Badge**: locked row in Get ready, then its own card once every step is ticked and readiness confirmed; shareable "I'm fully ready" graphic. WhatsApp poster mock-up produced (drawn stand-in portrait, not a photo).
- **Groups page strip**: green/amber dots for "Support introduced" and "Meeting time set"; the support's extra onboarding step is the group meeting time (Groups page and Supports page).
- **Group call limits** in Settings (days, earliest start, finish-by, lengths) enforced by the picker and by a database trigger for non-admins (migration, live). Message-box send button back at the right edge (help button lifts above it).
- Code reviews run on each stretch; real bugs fixed (hooks above early returns, in-flight like taps, download counted only when saved, first two Sundays on or after start date, null blobs).

## Files Changed
frontend: `utils/birthdayGraphic.ts`, `utils/readyGraphic.ts`, `utils/groupMeetingLimits.ts`, `components/BirthdayGraphicSheet.tsx`, `ScriptureActions.tsx`, `participantApp/ReadyGraphicSheet.tsx`, `settings/GroupCallLimitsCard.tsx`, `groups/GroupOnboardingStrip.tsx`, `GroupMeetingSlotEditor.tsx`, `groups/GroupCallCard.tsx`, `discussion/DiscussionFeedView.tsx`, `NeedSupportButton.tsx`, pages (Birthdays, Scriptures, Settings, Groups, Supports, Participant Home), `public/fonts/montserrat/*`.
supabase: migrations `20261013100000_birthdays_list_avatar`, `20261013140000_scripture_engagement`, `20261013150000_scripture_engagement_by_cohort`, `20261014300000_group_meeting_limits`; `functions/push-reminders/index.ts`.
docs: handoffs for birthday graphic, scripture actions, venue-map reminders (plus nudges), ready gift/badge, group call limits; FLOW_MAP rules 58 to 61 (and 53 extended).

## Key Decisions & Patterns
- Nothing is pushed unless the user says so; commits stay under the repo's existing author; the Stop hook's re-author request was declined each time.
- When a deployed edge function is behind the repo (another stretch left changes undeployed), build the deploy from the live-matching version plus only the new block.
- Time-boxed sends are verified with the function's `dryRun` and a stand-in clock before they go live.
- A new table gets one real foreign key at most; people are plain ids (FLOW_MAP rule 55).
- Review findings are fixed unless they are deliberately accepted (listed in each handoff).

## Backend / Handoff Notes
Live now: the four migrations above and `push-reminders` v49. The repo copy of `push-reminders` also carries the roles-and-permissions change that was never deployed (live does not have it). The one-off nudge block in `push-reminders` can be removed after 10 Oct.

## Pending Tasks
- Check on a real phone: share sheet, the venue-map deep link, the badge, the group message box.
- Dashboard late-onboarding counts do not include the new meeting-time step (the health feed has no meeting times).
- Hub meetings and admin-set meetings are not limited by the group call limits.

## Errors Hit & Fixes
- Map-link hook sat below the loading early-return (would crash Home): moved above.
- Week 2 of the cohort is moved in the Planner, so "first two class weeks" skipped the right weekend: switched to the first two Sundays from the start date.
- First 6 pm nudge wording told people to ask their support to welcome them; corrected to "support first" (a participant can only introduce themselves after their support has).
