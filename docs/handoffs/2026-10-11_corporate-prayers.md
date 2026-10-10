# Corporate prayers: admin page, prayer screen and live prayer

## Summary
Built from `docs/specs/corporate-prayers-admin.md` (Parts 2, 3 and 4 of the prayer plan; Part 1, the opt-out, was live already).
- **Admin page** `/corporate-prayers` (sidebar Engagement, admin only): tabs **Schedule** (start week and pop-up days moved here, daily slots), **Verses** (library, add / add several / reorder / switch off, `{{NAME}}` and `{{Name}}`, warns on gendered words),
  **Live prayer** (Telegram link, wait before Prayed, one line), **Coverage** (cycle progress per pool, who is still to come, skip / restart, today's counts, hubs) and **Preview** (the real screen with sample counts). A status strip says Not set up / Starts in N days / Running / Ended and what is missing.
- **Prayer screen** `/me/pray` (participants) and `/support/pray` (supports): person's photo under a dark gradient (or a coloured circle with initials), their faith project as written, the verse prayer with their first name, a ring timer that drains,
  counts ("N praying", "N said Amen", no names), Amen. Opening it checks you in; you can leave any time. A **Time to pray** card sits at the top of Home while one is open.
- **Live prayer**: a required pop-up (priority 28) with an Open Telegram button; **Prayed** unlocks N minutes after the link tap (admin sets N). No close button, Escape and outside taps do nothing; after ten minutes without opening the link, "I could not open Telegram" appears.
  It never shows without a Telegram link.
- **Notifications**: a per-minute job a minute before a slot opens makes the day's session and sends one push plus one bell row to every counted person through the existing `notify-users` function.
- The Faith project settings sheet no longer edits the start week; it links to the new page (same stored setting, `FaithProjectSetting`).
- Guide entries (admin, support, participant), page tour `admin:corporate-prayers`, FLOW_MAP rule 54.

## Live changes
**Applied live on 11 Oct 2026** (Management API, one transaction): `supabase/migrations/20261011100000_corporate_prayers.sql`. It created 8 locked tables (`CorporatePrayerSlot`, `Verse`, `Setting`, `Session`, `Target`, `Checkin`, `Cycle`, `Skip`: row-level security on, the public key has no privileges on them),
the functions (19 callable with a session token, 19 internal helpers the public key cannot call) and the cron job `corporate_prayer_slots_every_minute` (jobid 17, every minute; returns at once until a notifying slot exists).
Checked live afterwards: the full 43-check scenario was run against the applied schema inside a transaction that always rolls back, and passed; the tables are empty, the cohort's dates and the Faith project settings are untouched, and no start week is set, so nothing runs and nobody is notified until an admin sets it up.
The frontend was pushed after the migration, so the new functions exist when the page loads. No edge function is new or changed.
**Rollback:** drop those tables and functions and run `select cron.unschedule('corporate_prayer_slots_every_minute')`. Nothing else was changed.

## How it was tested
- **Database**: the migration plus a scenario script run inside one transaction that always rolls back (nothing was kept). 43 checks pass: duplicate time refused; participant and support blocked from admin functions; bad token gets nothing; one session per slot per day;
  verse slot shows a person and verse but no project; support sees the same cohort-wide person; counts after two joins (joining twice counts once) and after an Amen; hub mode gives 7 hubs 7 different people; across 13 simulated days no one repeats within a cycle and no one is prayed for twice in a day
  (pool 15, 7 hubs, reached cycle 7); an opted-out person is replaced when their hub's person is opened; coverage, restart, preview; live prayer refuses Prayed before the link and inside the wait, allows it after, and the ten-minute exit works;
  a late first join is refused but someone already in may return; the notifier sends once per opening; pools exclude teens, tests and opt-outs; the public key cannot read the tables or call the internal helpers. (Because Cohort 10 starts tomorrow, the test moved its start date back inside the rolled-back transaction.)
- **Browser** (mocked backend, fake clock for the live wait): admin page at desktop and 390 px (add slot, duplicate time message, bulk verses with a problem flagged then fixed, save the live link, coverage numbers, preview with the name in capitals, no horizontal scroll, no page errors);
  participant flow (banner, open, checked in, project and verse shown, Amen, thanks, Done, banner gone); support route the same; live pop-up (appears and checks in, cannot be closed, Prayed disabled before the link and during the 5-minute wait, enabled after, closes). Screenshots checked by eye.
- `npm run build`, the type check (only the 27 old errors), lint on the new files, `git diff --check`.
- **NOT tested**: with real logins or real participants (the live schema was tested only by the rolled-back scenario); real push delivery (the notifier and `notify-users` were not run for real); real Telegram links; many people opening a slot at the same second (the biggest risk, see below); the admin page with real hubs and a full cohort.

## Code review (done before committing) and what changed because of it
A review of the staged change found real problems, all fixed and re-tested: the teen test was narrower than the one the age-bracket trigger uses and ignored teen groups (now the same labels plus teen-group membership); replacing an opted-out person on read could race and rewrite a closed
session (now only while open, under the same per-cohort-and-pool lock the rotation takes, excluding the other hubs' people); two slots of one pool could pick the same person or bump the cycle twice (one lock per cohort and pool); editing or switching off a slot after today's session existed did
nothing that day (an unjoined session is now remade, and switching off ends an open one); the notifier claimed a slot before it could send and could announce late (it now waits for the secrets, looks back 2 minutes and skips slots changed after they opened); the live pop-up checked you in
before it was shown (now on screen only); a stale signal answer could bring the pop-up back; the prayer page showed an Amen screen for a not-yet-open or ended prayer (now a clear message, and a page waiting for the slot checks in when it opens); skipped people never completed the cycle total; a
window that crosses midnight stopped working at 00:00 (yesterday's sessions still count, and "next" looks to tomorrow); and the live countdown spoke every second to screen readers (now only when the state changes), with focus moving into the pop-up. Known limit: `net.http_post` is
fire-and-forget, so a failed send inside `notify-users` is not noticed by the job.

## Defaults I chose for the open questions in the spec (change any of them)
Name in prayers is the **first name** (`{{NAME}}` capitals, `{{Name}}` as written). Hubs pray for **anyone** in the cohort not opted out, **one person per hub per faith-project slot**; people with no hub share a `NO_HUB` target. Verse slots are always **one person for everyone** and never show the project.
**Admins who also hold the Support role are counted**; plain admins are not. The verse library is **global** (shared by every cohort), the cycling position is per slot. Join window defaults to 15 minutes. Supports are never the person prayed for.

## Open items
- **Load at slot time.** Everyone opens within about a minute of the push. The screen loads from one call, the timer runs on the phone, counts poll every 10 s with jitter (visible tabs only), writes are two per person. Still, watch the Supabase usage page the first few days and be ready to slow the 10 s count poll.
- The Home banner and live pop-up rely on a one-minute signal poll per open app (`corporate_prayer_signal`, tiny, visible tabs only). Someone with the app closed gets the push and bell row; opening the app within the window shows the banner.
- Test the Telegram link with a real call before the first live prayer.
- The Preview and Coverage tabs list names for admins only.
- Not built: a way to pin a specific person to a slot, per-hub counts, or notifying only some people.
