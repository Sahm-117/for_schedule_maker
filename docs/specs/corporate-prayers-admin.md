# Corporate Prayers: admin page (build spec)

Status: **spec only. Nothing in this file is built.** Written 10 Oct 2026 from the product quiz and the code as it stands at `fd95cfa`.
Part 1 of the original plan (opt-out, start week, pop-up) is already live (FLOW_MAP rules 49 and 50). This file is Part 2, the admin page, plus the data
and functions it needs, and the contracts Parts 3 (the slot screen) and 4 (the 9pm pop-up) rely on.

## 1. What the page is for

Admins decide **when** the cohort prays together, **how often**, **what is prayed**, and **who is prayed for**. Everyone else (participants and supports) only
receives the result: a notification at slot time, a screen with a person and a verse prayer, a timer, an Amen button, and live counts.

The page does five jobs:
1. **Schedule:** the start week, how many days before the opt-out pop-up appears, and the list of daily slots.
2. **Slots:** each slot's time, type, timer, join window and how people are chosen.
3. **Verse library:** the prayers that rotate through the slots.
4. **Live prayer (9pm):** the Telegram link and the wait before "Prayed" unlocks.
5. **Coverage and preview:** who has been prayed for so far, restart the cycle, and see exactly what a slot looks like before it goes live.

## 2. Decisions already made (do not reopen)

| Topic | Decision |
|---|---|
| Where it lives | A module (its own admin page), not a tab buried in Settings |
| Days | Every day, from the start week to the end of the cohort |
| Slots per day | Admin sets how many (3, 4, ...), each with its own time |
| Slot types | **Verse and picture** (generic prayer with the person's photo), **Faith project** (their project plus a verse prayer), **Live prayer** (Telegram) |
| Timer | Default 15 minutes, set per slot. Anyone can leave any time |
| Join window | Admin sets it, per slot |
| Check-in | Opening the slot checks you in. **Amen** checks you out |
| Counts | Everyone sees "N praying" and "N said Amen". No names, no drop-off nudges |
| Who is counted and notified | Participants and supports. Admins are not |
| Who is prayed for | Faith-project slots: admin chooses **one person for the whole cohort** or **hub mode** |
| Hub mode | Each hub (its supports and their participants) prays for a different person that day. The app records who has been prayed for, shows new people next time, and starts the cycle again when everyone has had a turn |
| Opt-outs | A person who opted out is never shown, in any slot type |
| Project wording | Shown exactly as the participant wrote it, then the verse prayer. Nothing is reworded |
| Verse choice | Library in order, cycling. Everyone sees the same one |
| No photo | A coloured gradient circle with the person's initials |
| 9pm live slot | Only a pop-up with the Telegram link. "Prayed" unlocks N minutes after they tap the link (default 5, admin sets it). It cannot be closed before that |
| Teens | Not included (no login) |
| Admin mobile nav | Unchanged. This is a desktop-sidebar page |

## 3. Placement and navigation

- Route `/corporate-prayers`, admin only (`adminOnly: true`).
- Sidebar: **Engagement** group in `components/AppShell.tsx`, after Surveys. Label "Corporate prayers".
- Also reachable from the Faith projects page: a "Corporate prayers" link in its overflow menu and in its settings sheet.
- The admin mobile bottom bar does not change (AGENTS.md: Dashboard, Schedule, Participants, Supports, Community). On a phone the page is reached from More.
- `PageHeader` with `title="Corporate prayers"`, one primary action ("Add slot") and an `AppOverflowMenu` for "Restart the cycle" and "Preview as a participant". Never more than two header actions.
- Register the tour id `admin:corporate-prayers` in `constants/tours.ts` and add the page to `public/guides/app-guide/content.js` (admin section).

### The settings that move here
`FaithProjectSettingsModal` today holds "Write-it-by date", "Corporate prayers" (start week, days before the pop-up) and categories. The two corporate-prayer fields
move to this page and the modal keeps only a link to it. Storage does **not** change: `FaithProjectSetting.prayersStartWeekNumber` and `.prayerPopupDaysBefore` stay,
because `participant_home`, `faith_prayers_start_date` and `faith_prayers_prompt_due` already read them (rule 50).

## 4. Page layout

Segmented tabs under the header (same component as other admin sections): **Schedule · Verses · Live prayer · Coverage · Preview**. On narrow screens the tabs scroll sideways; each tab is one column of cards.

A **status strip** sits above the tabs on every tab:
`Cohort 10 · Prayers start Week 3 (Sun 25 Oct) · 3 slots a day · Running / Starts in 4 days / Not set up`
States: *Not set up* (no start week or no slots), *Starts in N days*, *Running*, *Ended*.

### 4.1 Schedule tab
1. **Start** card: "Corporate prayers start in" week picker (`AppSelect`, weeks of the active cohort, shows the class date it resolves to) and "Show the opt-out pop-up N days before" (0 to 30, same validation as today).
   Saving calls the existing setting RPC, so participants' pop-up behaviour is unchanged.
2. **Daily slots** list: one card per slot, ordered by time. Each card shows: time, a type chip (Verse and picture / Faith project / Live prayer), "15 min timer", "joinable 15 min", and for faith-project slots "One person for everyone" or "By hub".
   Card actions (overflow menu): Edit, Disable (keeps history), Delete (only when it has never run; otherwise Disable).
3. Empty state: "No slots yet. Add the first one." with the Add slot button.
4. A one-line summary under the list: "3 slots a day, 05:50, 14:50, 20:50. 77 people in the pool."

### 4.2 Slot editor (portal modal, `ModalShell`)
| Field | Control | Rules |
|---|---|---|
| Name | text | Optional, up to 40 chars. Default: the type and time, e.g. "Morning verse" |
| Time | time control (same pattern as `GroupMeetingSlotEditor`) | Africa/Lagos, 24 h, no seconds. Two slots cannot share a time (error: "Another slot is already at 05:50") |
| Type | segmented: Verse and picture · Faith project · Live prayer | Changing type keeps time and timer |
| Timer (minutes) | number stepper | 1 to 120, default 15. Hidden for Live prayer |
| Join window (minutes) | number stepper | 1 to 240, default 15. The slot stays joinable this long after its time |
| Who is prayed for | segmented, shown only for Faith project: **One person for everyone** · **By hub** | Default: By hub when the cohort has hubs, else One person |
| Verses | "Use the library, in order" (fixed in v1) | Shown as read-only text so the rule is visible |
| Live prayer fields | Telegram link + wait before Prayed unlocks (minutes) | Only for Live prayer; see 4.4 |
| Notify | switch "Send a notification at slot time" | Default on |
| Active | switch | Off keeps the slot but skips it |

Save validates, then calls `upsert_prayer_slot`. Editing a slot never rewrites past days; it applies from the next occurrence (see 6.3).

### 4.3 Verses tab
A table (cards on phone) of the library, in the order they cycle.
- Columns: order (drag handle), prayer text (first two lines), reference, used-in count ("Used 4 times"), active switch.
- **Add verse** modal: *Prayer* (multiline), *Reference* (e.g. "Eph 1:17-18"), *Active*.
- **Template format.** The prayer text may contain these placeholders, replaced at display time:
  - `{{NAME}}`: the person's name in capitals, as in the hand-written posts ("give you, NAME, the spirit of wisdom").
  - `{{Name}}`: the name as written.
  - Nothing else. In particular **no gendered words** and no `{{project}}`: the project is shown separately as written (decision above), so a prayer must read correctly without knowing the person's gender. Validation rejects `her`, `his`, `she`, `he` outside a placeholder with a warning (not a block).
- **Bulk add:** paste several prayers separated by a blank line, one reference per block on its last line starting with `-`. A review step shows how each splits before saving.
- Live **preview** under the editor: the prayer rendered with a sample name ("Adaeze") and the reference.
- Reordering saves immediately. Deleting a verse that has been used is blocked: it can be deactivated instead.
- Empty state and a guard: a slot of type Verse or Faith project **cannot go live with an empty library** (status strip shows "Add at least one verse").

### 4.4 Live prayer tab
- **Telegram link** (https only; `t.me/...` or `telegram.me/...` accepted; anything else warns "This does not look like a Telegram link" but can be saved).
- **"Prayed" unlocks after** N minutes (0 to 60, default 5), counted from the tap on the link.
- **Pop-up text**: one editable line shown above the link (default "Join the live prayer on Telegram"). Max 120 chars.
- **Test the link** button: opens the link in a new tab. A reminder under it: "I cannot check from here that a call link joins the call directly. Test it with a real link before the first live prayer."
- A read-only note that the pop-up cannot be closed before "Prayed" unlocks.

### 4.5 Coverage tab (who has been prayed for)
- Progress bar for the **current cycle**: "41 of 77 people prayed for in this cycle" with "Cycle 2".
- A list of people **not yet** prayed for in this cycle (search, count) and a collapsed list of people already done with the date. Names are visible to admins only.
- **By hub** table: hub name, supports, participants, people prayed for this cycle, next-up count. A hub with no members shows "No participants".
- **Today** card: for each slot today: scheduled time, status (Upcoming / Open / Closed), joined, said Amen. Polled with `usePolling` at 15 s while the tab is open (rule 51). Counts only.
- Actions: **Restart the cycle** (confirm modal explaining that everyone becomes eligible again and nothing is deleted), **Skip this person** (opt a person out of the *current cycle only* without touching their consent).
- Shows eligible-pool numbers separately for the two pools in 6.2.

### 4.6 Preview tab
- Choose a slot (or "all three") and a person (search, or "Next in rotation"), then **see the participant screen exactly as it will render**: photo or gradient circle, name, project text (faith-project slots), the verse prayer with the name filled in, the reference, the timer, the Amen button and sample counts.
- Light and dark, phone width only.
- Uses the same component as Part 3's slot screen, fed sample data, so the preview cannot drift from the real thing. Marked clearly "Preview. Nothing is sent."

## 5. Data model (one migration, born locked)

All tables follow FLOW_MAP rule 11 (closed by default, reached only through `SECURITY DEFINER` functions), rule 52 (wrapped helper calls in any policy) and carry nothing for test participants.

```
CorporatePrayerSlot
  id uuid pk, cohortId uuid -> Cohort, name text,
  timeOfDay time not null,                 -- Africa/Lagos wall time
  slotType text check in ('VERSE','FAITH_PROJECT','LIVE'),
  timerMinutes int default 15 check 1..120,
  joinWindowMinutes int default 15 check 1..240,
  targetMode text check in ('COHORT','HUB') null,   -- FAITH_PROJECT only
  notify boolean default true, active boolean default true,
  sortOrder int, createdAt, updatedAt
  unique (cohortId, timeOfDay) where active

CorporatePrayerVerse
  id uuid pk, prayer text not null, reference text not null,
  sortOrder int, active boolean default true, createdAt, updatedAt
  -- global library, reused across cohorts

CorporatePrayerSetting          -- one row per cohort
  cohortId pk, telegramLink text, liveWaitMinutes int default 5 check 0..60,
  liveMessage text, updatedAt

CorporatePrayerSession          -- one row per slot per day, created lazily (6.3)
  id uuid pk, slotId, prayerDate date,       -- Lagos date
  opensAt timestamptz, closesAt timestamptz, timerMinutes int,
  verseId uuid, createdAt
  unique (slotId, prayerDate)

CorporatePrayerTarget           -- who is prayed for in that session
  sessionId, hubKey text,                    -- hub uuid, or 'COHORT' / 'NO_HUB'
  participantId uuid, cycleNo int,
  primary key (sessionId, hubKey)

CorporatePrayerCheckin          -- written by Part 3
  sessionId, personKind text ('PARTICIPANT'|'SUPPORT'), personId uuid,
  checkedInAt timestamptz, amenAt timestamptz null
  primary key (sessionId, personKind, personId)

CorporatePrayerCycle            -- bookkeeping per cohort and pool
  cohortId, pool text ('FAITH'|'NAME'), cycleNo int, startedAt, restartedById
```
Skips (4.5) are rows in a small `CorporatePrayerSkip(cohortId, participantId, cycleNo)`.

Indexes: `(slotId, prayerDate)`, `(sessionId)` on checkins, `(cohortId, pool, cycleNo, participantId)` on targets for the "not yet prayed" query. Counts are computed with `count(*)` over checkins by session; if a slot's checkins ever pass a few thousand, add a counter row updated by trigger.

## 6. Rules and algorithms

### 6.1 Who counts
- **People notified and counted:** active participants (not `isTest`, not teens) and active supports in the cohort, who have a login. Admins are never counted, even when they also carry the Support tag *unless* they hold a group (decision to confirm, see 10).
- **Opt-out:** `Participant.prayerConsent = 'OUT'` excludes a person from being prayed for **and** from the pool, in every slot type. It does not stop them praying if they open the slot.
- **Start:** a slot only runs on or after the start date (`faith_prayers_start_date`, the class date of the start week, Lagos date) and through the cohort end date.

### 6.2 Two pools
| Pool | Used by | Members |
|---|---|---|
| FAITH | Faith-project slots | People with `faith_project_prayable(...)` true: saved text, not opted out, prayers started |
| NAME | Verse and picture slots | Every active, non-test, non-teen participant who has not opted out (they need a photo or initials, not a project) |

Each pool has its own cycle number and its own "who has been prayed for". A person can be in both pools and prayed for once per pool per cycle.

### 6.3 Making a day's sessions
Sessions are created **on demand, once**, by `ensure_prayer_session(slot, date)`:
- Takes an advisory lock on `(slotId, date)` so two phones opening at the same second create one session.
- Sets `opensAt = date + timeOfDay (Lagos)`, `closesAt = opensAt + joinWindow`, copies `timerMinutes`.
- Picks the verse: the library ordered by `sortOrder`, index = number of earlier sessions of that slot, modulo the active count. The chosen `verseId` is stored, so editing the library later does not change a day that already ran.
- Chooses targets (6.4) and stores them.
- Editing or disabling a slot affects sessions not yet created. A session that already exists keeps its values.

### 6.4 Choosing who is prayed for
For a session in pool P with `targetMode`:
- **COHORT** (one person for everyone): pick one person; `hubKey = 'COHORT'`.
- **HUB**: one person per hub that has at least one member, plus one for `'NO_HUB'` (participants whose support has no hub, and supports with no hub).
  A participant's hub is their group's support's hub (`GroupParticipant -> Group.supportId -> HubMembership`).

Picking, in order, for each hub key (hubs processed in a fixed order, e.g. by name, so results are repeatable):
1. Eligible = pool members for P, minus anyone already chosen **today in this pool** for another hub or slot, minus anyone skipped this cycle.
2. Keep those with no turn in the **current cycle**.
3. If none left, **start the next cycle**: `cycleNo + 1`, record it, and go back to step 1 with everyone eligible again.
4. Of those, choose the one **longest since last prayed for** (never prayed = first). Ties broken by a stable hash of `(personId, date)` so repeated runs agree.
5. Hubs do not have to pray for people in their own hub. The pool is the whole cohort (confirm in 10).
A hub's own members *may* be chosen for another hub's slot; a person is never prayed for by two hubs on the same day in the same pool.

New joiners during the cohort enter with no turns and are reached within a cycle. A person who opts out mid-cycle simply drops out of the eligible set.

### 6.5 Slot life cycle (what Parts 3 and 4 will read)
`Upcoming` (before `opensAt`) → `Open` (`opensAt` to `closesAt`) → `Closed`. The timer for a person starts when they open the slot (check-in) and runs `timerMinutes`; Amen ends it. Joining after `closesAt` shows "This prayer has ended".

## 7. Functions (RPCs). Admin side belongs to this spec

All take the session token like the rest of the app (`p_token` / `x-session-token`) and require an admin session unless stated.

| Function | Purpose |
|---|---|
| `corporate_prayer_overview(p_cohort_id)` | Everything the page needs in one call: settings, slots, verse count, pool sizes, cycle numbers, today's counts. One request on load (rule: load is cheap) |
| `upsert_prayer_slot(...)` / `archive_prayer_slot(p_id)` / `delete_prayer_slot(p_id)` | Create/edit, disable, and delete-if-never-run |
| `list_prayer_verses()` / `upsert_prayer_verse(...)` / `reorder_prayer_verses(p_ids uuid[])` / `deactivate_prayer_verse(p_id)` | The library |
| `set_corporate_prayer_settings(p_cohort_id, p_telegram, p_wait, p_message)` | Live prayer tab |
| (existing) `faith project settings` | Start week and days before; reused as is |
| `prayer_coverage(p_cohort_id)` | The Coverage tab: per pool, per hub, not-yet list |
| `restart_prayer_cycle(p_cohort_id, p_pool)` / `skip_prayer_person(p_cohort_id, p_participant_id)` | Coverage actions |
| `prayer_preview(p_slot_id, p_participant_id)` | Resolves a slot for a chosen person without creating anything |

**Contract for Part 3 (not built here):** `corporate_prayer_now()` (any signed-in participant or support: the open or next slot for me, my target person, verse, my check-in state, counts), `corporate_prayer_join(p_session)`, `corporate_prayer_amen(p_session)`, `corporate_prayer_counts(p_session)`.
Counts must be readable by participants, whose sessions differ from staff sessions, so the screen **polls** (`usePolling`, about 10 s with jitter) instead of relying on Realtime (FLOW_MAP rule 51: Realtime publishes only `Notification`).

## 8. Notifications

- A push and a bell notification at slot time to every counted person, through the existing `insertNotifications` / `insertParticipantNotifications` and web-push helpers. Both channels, as rule 10 requires, with a dedupe key `(sessionId, personId)` so a retry never double-sends.
- **Timing correction:** the existing `push-reminders` job runs every **10 minutes** (`push_reminders_every_10min`), not every minute as I said earlier. A slot at 05:50 could be notified up to 10 minutes late, which is too loose for a 15-minute prayer.
  Recommended: a per-minute `pg_cron` job (the attendance windows already use one) that runs a cheap SQL check, "is any slot opening in the next minute?", and only then calls a new edge function `notify-prayer-slot` through `net.http_post`. Most minutes it calls nothing.
- **Stampede:** the whole cohort opens the app within about a minute of a push, three or four times a day. The slot screen must therefore load from one light request, count with the client's own clock (no polling for the timer), poll counts slowly with jitter, and write only twice per person (check-in, Amen). Re-test this specifically; the earlier load work did not test real concurrent load.

## 9. Conventions this page must follow

- Shell and header: `PageHeader`, `AppOverflowMenu`, route-based staff shell. No new modal styles: use `ModalShell` portalled to `document.body`.
- **No native `<select>`.** Use `AppSelect` / the portal dropdown patterns for week, type, hub and person pickers.
- Polling only through `usePolling` / `startPolling` (rule 51). No Realtime table listeners.
- Policies wrap `app_is_staff()` / `app_is_admin()` as `(SELECT ...)` (rule 52).
- Test participants and test users are excluded from every count and rotation.
- The single current-cohort rule (rule 2) decides the default cohort; the page works on the active cohort chosen in the shell.
- Apple-leaning house design: SF system font stack, sentence-case labels, calm spacing, status in chips not colour alone.
- Accessibility: every control labelled, visible focus, tabs are a proper tablist, errors announced inline, counts and chips have text, not colour only.
- Add a FLOW_MAP rule (next number) when built, and a handoff in `docs/handoffs/` with every migration and function listed.

## 10. Open questions (each has a recommended default)

1. **How is the name written in the prayer?** Full name, first name, or first name plus initial? *Default: first name, capitalised in `{{NAME}}`; the full name shown on the card.* (The hand-written posts show NAME in capitals.)
2. **Hubs and who they pray for.** Confirmed in the quiz as "different people per hub per day". Assumed here: any non-opted-out person in the cohort, not only a hub's own members. *Default: whole cohort.*
3. **One person or several per hub per slot?** *Default: one per hub per faith-project slot.*
4. **Supports with no hub, and participants with no group.** *Default: a shared `NO_HUB` target, one person.*
5. **Admins who also hold a group.** Are they counted and notified as supports? *Default: counted only if they hold a group; plain admins are not.*
6. **Verse library scope.** One global library, or one per cohort? *Default: global, with the cycling position kept per slot.*
7. **Verse and picture slot and projects.** The morning post has no project. Confirm that this slot never shows the project text. *Default: correct, never.*
8. **Join window default.** *Default: equal to the timer (15 minutes).*
9. **Live slot "Prayed" gating.** Confirm the wait counts from the tap on the Telegram link, not from the pop-up opening. *Default: the link tap.* If someone never taps the link, "Prayed" never unlocks; allow a "I could not open Telegram" escape after 10 minutes? *Default: yes, with a log.*
10. **Photos.** Use the participant's profile photo (`Participant.avatarUrl`). Supports shown as the prayed-for person? *Default: never, only participants are prayed for.*
11. **Late edits.** If admin changes a slot's time after sessions exist for later days, those already-created sessions keep the old time. *Default: sessions are created only when first needed, normally on the day, so this rarely matters.*
12. **Verse screenshots.** The final template format was to be fitted to the three screenshots (05:50, 14:50, 20:50). The format in 4.3 is derived from them; please confirm one real example from each.

## 11. Edge cases the build must handle

- No start week set, no slots, or an empty verse library: status strip says what is missing; nothing is created.
- Start week earlier than today (cohort already running): the first session is today's remaining slots only.
- Two slots at the same minute; a slot time that has already passed today when created: the first session is tomorrow's (or today's if still inside its join window).
- A hub with no participants, or the only eligible person already used today: fall back to the next cycle rule (6.4 step 3) rather than showing nobody; if the pool is empty, the slot shows "No one to pray for today" and is excluded from counts.
- Everyone opted out; one eligible person only (they are prayed for every slot until others join).
- A person's project edited between the session being created and a participant opening it: show the **current** saved text.
- A person opts out after being chosen for a future session already created: replaced on open (re-pick), never shown.
- Cohort ends, or a slot is deleted: history stays; nothing new is created.
- Time zone: Africa/Lagos has no daylight saving, but all comparisons are made in UTC with the Lagos date computed in SQL (`week_class_date` style), never in the browser.
- Clock skew: the timer uses the server's `opensAt`, not the phone's clock, for when the slot starts; only the countdown display runs locally.
- The same person in two pools on the same day: allowed (once per pool).

## 12. Acceptance checks

1. As admin, add three slots (05:50 verse, 14:50 faith project by hub, 20:50 live) and save. Reload: all three persist, ordered by time.
2. Two slots at one time are refused with a clear message.
3. Add five verses in a bulk paste; the review step splits them correctly; a verse with `her` raises a warning.
4. Preview shows the right text for a person with no photo (gradient circle with initials) and for a faith-project slot (project as written, then the prayer).
5. Coverage: with 6 hubs and 77 people, running a simulated three days gives 18 distinct people per day in the faith pool with none repeated inside a cycle; after everyone has had a turn the cycle number goes up.
6. A person who opts out between days never appears again; a new joiner appears within one cycle.
7. Setting the start week and "days before" here changes the participant pop-up exactly as the old modal did (regression check against rule 50).
8. Rolled-back SQL: `ensure_prayer_session` called twice in parallel gives one session and one target set; RLS: no token, participant, support and admin each get the right answers (reuse the four-viewer count test used for rule 52).
9. A non-admin cannot open `/corporate-prayers` or call any admin function.
10. Build passes, type check shows no new errors, browser test with the mocked backend at desktop and 390 px with no horizontal scroll, no console errors; handoff and FLOW_MAP rule added.

## 13. Build order for this part

1. Migration: tables, constraints, RLS-locked, the admin functions in section 7, `ensure_prayer_session` and the selection algorithm, with rolled-back SQL tests including the rotation simulation.
2. Page shell, route, nav, status strip, Schedule tab (start week moved here) and the slot editor.
3. Verses tab with bulk add and preview.
4. Live prayer tab and Coverage tab.
5. Preview tab (needs the shared slot-screen component from Part 3; build that component first in a "sample data" mode).
6. Guide content, tour, FLOW_MAP rule, handoff.

Then Part 3 (slot screen, counts, notifications) and Part 4 (9pm pop-up) in that order. Ship the database part first and the page with a fallback that hides the page if the functions are missing (the earlier deploy-order lesson).
