# Corporate prayers: Option B (live prayer on Telegram, daily prayer in the app, the Wall)

Date: 2026-11-04. Built from the owner's "Option B · every click" design canvas and their comments on it.

## Summary

- **Live prayer (Telegram).** A full screen with two counts, opened the app and tapped Join on Telegram, plus one Join button. The app is not connected to Telegram: it only opens the link, so it never claims who is on the call.
  - Tapping Join counts as praying: it sets `amenAt`, so it counts for the streak.
  - There is no Prayed button, no wall, no replies and no Amen.
  - The screen stays until the prayer ends, then shows "Back to Home".
  - After ten minutes without a tap, "I can't join tonight" records that and closes the screen.
- **Daily prayer (in the app).** Not a call: people pray where they are.
  - **Opening:** it opens by itself when it starts while the app is open (started under 3 minutes ago). Later arrivals start it from the Home card, and a push opens it.
  - **First time:** a 3-step guide comes first on each phone; the timer starts after it.
  - **Timer and Amen:** the timer counts up against 15 minutes, which every screen suggests, including the Amen button. Amen opens after 3 minutes and the database enforces it.
  - **Can't close:** there is no Leave. Once started it comes back over everything until Amen, even after its window closes.
  - **Missed or unfinished:** it waits on Home until midnight Lagos and still counts.
  - **Other screens:** "welcome back" when returning mid-prayer, and "window closed, your Amen still counts".
  - **After Amen:** "You prayed N minutes · you and X others".
- **Wall** (daily only).
  - People praying can leave up to 5 words of up to 140 characters each: "Praying", "Praying for you, Name", or their own.
  - Everyone praying for that person sees the words with first names.
  - An admin who also supports, or the lead of the writer's hub, can tap Hide. The message goes for everyone and the writer isn't told.
- **The person prayed for:**
  - While it is on: "Today, we're praying for you" with numbers only, and they can close it.
  - Once it ends: a Home card and one bell and push, "N people prayed for you today", opening the words people left.
- **Home card** (`PrayerNowBanner`) shows, in order:
  - live now;
  - you're being prayed for;
  - praying now (late) or finish praying;
  - you missed it;
  - your prayer's words are ready;
  - next prayer ("it opens by itself").
- **Admin:** the "Prayed unlocks after" setting is gone from the slot editor and the Live prayer tab; the stored value is kept for old phones. The Preview tab draws the new screens. The guide entries are updated.
- FLOW_MAP rule 132 is new; rules 54 and 98 point to it.

## Live changes

Both migrations were **applied live on 4 Nov 2026** (Management API, each in one transaction, in order) before the frontend was pushed. Checked afterwards: 8 new functions present, the table is locked (row-level security on, no public key access), the internal helpers can't be called with the public key, signal and notifier are the new versions, and the Wall is empty. No edge function changed.

- `supabase/migrations/20261104100000_prayer_option_b.sql`
  - **New:** column `CorporatePrayerCheckin."cantJoinAt"`; helpers `prayer_late_until`, `prayer_session_target` and `prayer_is_target` (internal); function `corporate_prayer_cant_join`.
  - **Changed:** `prayer_counts_json` (adds `tapped`), `corporate_prayer_join`, `_link_tap`, `_amen`, `_now`, `_signal`.
- `supabase/migrations/20261104110000_prayer_wall.sql`
  - **New:** table `CorporatePrayerWallPost` (locked, row-level security on, no foreign key to Participant or User, per rule 55); column `CorporatePrayerTarget."summarySentAt"`; `prayer_amen_for_target` (internal); `corporate_prayer_wall`, `_wall_post`, `_wall_hide`.
  - **Changed:** `corporate_prayer_signal` (adds `forMe`) and `notify_prayer_slots` (the "prayed for you" notification; the daily push now says "It is not a call: pray where you are").

Rollback notes are at the top of each migration. On 4 Nov only the Practice cohort had prayer slots (Cohort 10 had none), so applying them catches nobody mid-prayer. Both are safe for phones still on the previous app version.

## How it was tested

- **SQL:** both migrations plus scenario scripts, inside transactions that always roll back, against the live database (Practice cohort):
  - The person prayed for can't join (`IS_YOU`) and sees `isMe`.
  - Amen is refused at 0 minutes and allowed at 3.
  - A missed prayer shows as `missed`, can be joined late, then shows as `unfinished`, and can't be joined after its day.
  - "I can't join tonight" is refused before 10 minutes, then works; tapping Join clears it and sets Amen.
  - A closed live prayer can't be joined.
  - Wall:
    - Posting needs a check-in; 141 characters and a 6th message are refused.
    - The person prayed for sees nothing while it is on, then the words and the count afterwards.
    - Participants and the author can't hide; a hub lead can hide only their hub's messages; an admin can hide any.
    - `forMe` appears only for the person prayed for.
  - The public key can't read the table or call the internal helpers.
- **Browser:** local frontend against the live backend, signed in as a Practice test participant at 390 px, with the prayer calls mocked in the browser (nothing written). Cases checked by screenshot:
  - Live: opened, tapped, no tap after 10 minutes, then "I can't join tonight".
  - Daily: the guide's 3 steps, then praying (Amen locked), Read all, welcome back with Amen open, confirm, the done screen, and back Home.
  - Home cards: late, missed, you're being prayed for, next.
  - Wall: quick word, own word, Hide.
  - The prayed-for summary.
  - No console errors. The temporary sign-in rows were deleted.
- `npm run build` (type check and tests), eslint on the changed files, `git diff --check`.

## Code review (before pushing) and what changed

A high-effort review of the commit found 10 items; these were fixed and re-tested:
- "Am I the person prayed for" only looked at the caller's own hub. In per-hub mode, a person prayed for by another hub could join their own prayer and was shown the wrong Wall. It now checks every target (`prayer_is_target`), and a rolled-back per-hub test passes.
- Their screen could go blank at the close while still holding the popup slot. The Wall is now polled for them too.
- The daily prayer now steps aside only while the live screen really wants the screen, not whenever any live session is open.
- A push for a live prayer with no link says so instead of silently landing on Home.
- The Home card's prayer details now refresh each minute instead of being kept for good.
- The Wall poll is every 30 s instead of 15.
- The avatars use the existing `PersonCircle`, and Lagos day keys use the new `lagosDayKey`.
- The hidden live-wait check was removed from the slot editor.

Left as is: the two takeovers still share some hold/done logic (a shared hook would tidy it), and `LivePrayerCard.tsx` is unused but kept (deleting needs approval).

## Not tested / open items

- **Not tried on a real phone or with real push delivery.** The "people prayed for you" push goes through the same `notify-users` path as the slot push, but only in live cohorts, so Practice can't show it.
- **Plain admins can't hide Wall messages.** They don't get the prayer screen at all; only admins who also hold the Support role, and hub leads, see Hide. If plain admins need moderation, add a Wall view to the admin Coverage tab.
- **Hide is a "Hide" button on the message, not a long-press as drawn.** It works the same way and is easier to find and use with a screen reader.
- **Wall "joined / said Amen" lines.** The design showed "X said Amen" lines on the Wall; only words are shown.
- **Counts in per-hub mode.** "praying now / said Amen" are per prayer (all hubs together). The "N people prayed for you" count is per person, but it attributes each pray-er by their hub.
- **`LivePrayerCard.tsx` is no longer used.** It was not deleted (deleting needs the owner's say-so).
- **The first-time guide is remembered per phone** (browser storage), so it shows again on a new phone.

## Gotchas

- `corporate_prayer_link_tap` now sets `amenAt` on a live prayer. Anything that counts "Amen" counts live Join taps too: the streak, the admin totals and `prayer_counts_json.amen`.
- The live pop-up hides on `cantJoin` or at the end, never on `amen`. The signal's `amen` stays true after "I can't join tonight" only so the previous app version closes its pop-up.
- `DailyPrayerTakeover` yields to the live screen whenever a live prayer is on. `PrayPage` no longer draws prayers: it hands the session to the provider (`start`) and returns Home.
