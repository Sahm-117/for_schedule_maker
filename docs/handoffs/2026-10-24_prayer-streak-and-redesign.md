# Prayer streak, badges, "I'm here / can't come", and the participant redesign touches

Date: 2026-10-24. Two live migrations; no function deploys.

## Summary

From the clickable redesign prototype, the parts that were not already in the app:

- **Prayer streak (participants and supports).** Days in a row with an Amen, best streak, total prayers, today's prayers with Join/Amen/Upcoming/Ended, group total for the week (no individual ranking). Faith page shows the full card; My Journey a one-line row; Home's Faith Project row a "N-day streak" chip.
- **Badges 5 / 10 / 21 / 30 / 70 days (Full cohort).** Celebration screen the first time one is earned (after Done on the prayer screen, or on opening Faith), a share picture with the person's photo and an orange "TCN Ikorodu | FOF" footer, and a "Tell my group" switch (off by default; the support is always told). Earned badges replay from the badge row.
- **"I'm here" / "Can't come today".** On the Attendance-is-open card. Sends the support a bell and push; never marks attendance. "Can't come" takes a reason.
- **Faith header:** the "Prayer on/off" chip is now a settings (gear) icon with a small on/off dot.
- **Home:** inspirational scripture now sits above the Group call / Faith Project rows; Monday shows "Do this first" and Tuesday "Still open" with an (i) tip beside the week pill while the reflection is unwritten.
- **My Group:** the support is one compact row with a WhatsApp icon; members are a swipeable row.
- **Desktop (lg and up):** card stacks on the participant pages (Home, Journey, Faith, My Group meeting, Week, People, Resources, Profile) flow into two columns instead of leaving the right side blank (`.desktop-cols` in `index.css`; `.span-all` keeps tabs and banners full width). Support Classes shows "Coming up" beside the next class. Support My Group is wider: the chat fills it (bubbles stop at 560 px) and the People tab shows two cards per row. The chat message box now sits at its stuck position when scrolled to the end (it floated about 28 px high).

## Live changes

Applied with the Management API:

- `20261024100000_prayer_streak.sql`: table `PrayerMilestone`; functions `prayer_streak_calc` (internal), `prayer_streak`, `prayer_milestone_seen` (callable with a session token). Re-applied once after adding name, photo and cohort to the response (idempotent).
- `20261024110000_class_signal.sql`: table `ClassSignal`; functions `class_signal_open_week` (internal), `participant_class_signal_mine`, `participant_class_signal`.

No edge function was deployed or changed. Rollback lines are at the top of each migration.

## Decisions and why

- **Full cohort badge** (stored as 70) is earned by praying on every prayer day of the programme, through the cohort's last day, with no miss and no rest day used. Cohort 10 has only 56 prayer days (26 Oct to 20 Dec), so a literal "70 days in a row" could never be reached.

- The streak is computed on read, not by a nightly job: nothing to drift, no cron to watch. Milestones are stored the first time they are seen.
- One rest day per Monday-to-Sunday week; days with no prayer session never break a streak; Amen only (no minimum time).
- Quick tiles on participant Home (Join call, Message support, Resources, Feedback) were kept: the prototype dropped them but nothing in the app replaces Join call. Repeated teacher chips on the Journey timeline were kept too.

## How it was tested

- SQL: scenarios run inside a transaction that always rolled back (current 1, best 8, total 9 for a hand-built pattern; milestone seen posts to the group once and clears `pending`; unearned milestone refused; class signal HERE then CANT, "mine" returns the latest, refused when no window is open). After the live apply: `PrayerMilestone` and `ClassSignal` are empty and the test slot and group post do not exist.
- Browser: local frontend with a mocked backend (a fake clock on Monday 26 Oct 10:00 Lagos): Home Monday and Tuesday labels and tooltip, streak chip, Faith card / today's prayers / group total / gear icon, replay and pending celebrations, Tell my group sent as `p_tell_group: true`, prayer screen Done then celebration then Home, Journey row, My Group row, attendance buttons and the can't-come reason sheet. No console errors.
- `npm run build`, eslint on the changed files, `git diff --check`.

## Open items

- **Not tried with a real login or the live backend.** Prayers start Monday 26 Oct for Cohort 10, so `prayer_streak` returns `available: false` until then; watch the first Amen and the first 5-day badge (Friday 30 Oct at the earliest).
- **No Monday/Tuesday push nudge** for an unwritten reflection. Only the in-app label and tip were built; a push would be a change in `push-reminders` (not touched).
- Desktop two-column layouts were checked in a browser only for the participant pages (mocked); the support Classes and My Group changes were type-checked and built but not seen in a browser. Support Schedule, Resources, Profile, My Hub and Attendance were left as they were (already full width or capped at 4xl).
- Share picture and celebration drawn on a canvas; checked in desktop Chromium only, not on iPhone Safari.
- Supports see the streak only on the prayer screen's celebration; there is no support Home card yet.

## Gotchas

- `prayer_caller(text, uuid)` is what decides who counts; teens and test accounts return nothing, so no streak for them.
- A badge celebration marks itself seen only when Done is tapped; closing the app mid-celebration shows it again next time.
- FLOW_MAP rules 98 and 99 describe both features.

## How to pick this up

Start from `PrayerStreakParts.tsx` (cards), `MilestoneCelebration.tsx` (the screen) and `utils/prayerMilestones.ts` (tiers). The SQL is in the two migrations above.
