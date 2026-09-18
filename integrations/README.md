# The Google Sheet and the FOF app

Sign-ups on the **FOF Signup Form** are sent into the FOF app, so every support
can see who has registered without having to ask the back office. Someone who
has signed up but not yet started the programme is a **prospect** in the app —
they only become a participant once they are registered.

Supports no longer register people in the app. They save a name and a number
when they meet someone, and the person fills in the form themselves once they
know what FOF is about. The form is what actually registers them.

## Turning the sign-up feed on (once)

1. Open the **FOF Signup Form (Responses)** spreadsheet.
2. **Extensions → Apps Script**, paste in the latest `google-sheet-lead-sync.gs`,
   and save.
3. Back in the spreadsheet: menu **FOF Sync → Connect form sign-ups**.
4. Google will ask you to authorise it. Accept.

That's it. From then on, each new form response is sent to the app as it
arrives. If it can't get through, the response still lands in the spreadsheet as
normal — the sheet is never held up by the app.

**People who filled in the form before you did this do not appear in the app.**
Only sign-ups from this point on are sent automatically -- but you can bring the
older ones in, below.

## Bringing in the people who signed up earlier

1. Menu **FOF Sync -> Preview past sign-ups**. This changes nothing at all. It
   reads the form tab and tells you what it would do: how many match someone the
   app already knows, how many would be added as new prospects, and how many have no
   name or number to work with.
2. If that looks right, menu **FOF Sync -> Import past sign-ups**, and confirm.

Worth knowing before you run the import:

- Someone who **matches a contact** is marked registered, which adds them as a
  participant in the back office -- the same thing that happens when a support
  marks them registered by hand.
- Someone who **matches nobody** becomes a prospect waiting to be assigned.
- The admins are **not** notified for these, unlike a live sign-up. Otherwise an
  import would fire one alert per row.
- Running it twice is safe. Rows already brought in are recognised and skipped.
- A long sheet may take a few minutes; Google will show a script running.

## The old direction (app → sheet) is off

Prospects saved in the app are no longer copied into this spreadsheet. The code
that did it is still there and still works if it is ever switched back on, but
nothing calls it now.

---

## Historical: how the app → sheet copy worked

This page is for whoever looks after that spreadsheet. **You don't need to be a
developer for anything in the first two sections.**

---

## When the form changes

All the settings live in the spreadsheet, in a tab called **Sync settings**:

| Cell | What it controls |
|---|---|
| **B2** | Which tab new sign-ups go into (e.g. `Form Responses 1`) |
| **B3** | What goes in "How did you learn about the FOF program?" for app prospects |
| **Table from row 7** | Which form column each piece of information goes into |

### A question was renamed
1. Open **Sync settings**.
2. Find the row for that information (for example *WhatsApp number*).
3. In column **B**, pick the new question from the dropdown.
4. Menu **FOF Sync → Check setup**. Every row should say **OK** (green).

### A new question was added to the form
Nothing to do. That column simply stays empty for people registered in the app.
If the app should *collect* that information too, that needs a developer.

### Sign-ups should go into a different tab (e.g. a new cohort)
1. Change **B2** to the exact tab name.
2. **FOF Sync → Check setup**.

### The Sync settings tab is missing or messed up
**FOF Sync → Rebuild settings tab.** It recreates the tab with the standard
setup, then checks it.

**Don't** rename anything in column **A** of Sync settings — those names are what
the app sends. Only change column **B**.

---

## How you'll know something is wrong

- **A notification** to operations each morning: *"Sign-up sheet sync needs
  attention"*, with the reason.
- **A banner on Follow-ups** in the app:
  - **Red — "N prospects didn't reach the Google sheet".** Fix the cause (usually
    the tab name in B2), then press **Retry now**.
  - **Amber — "reached the sheet with missing columns".** A question was
    renamed. Update Sync settings and run **Check setup**. Don't retry these —
    they're already in the sheet, and retrying would add them twice.

Prospects are never lost: they're saved in the app first, and anything that
fails is retried automatically every morning for 30 days.

---

## Only if the code itself changes (developer)

The script lives in the spreadsheet under **Extensions → Apps Script**
(`Code.gs`). The source is `integrations/google-sheet-lead-sync.gs` in this repo.

1. Paste the new code **from the file**, never from a chat window — copied
   chat text picks up stray words and breaks long lines.
   On a Mac: `pbcopy < integrations/google-sheet-lead-sync.gs`, then Cmd+V.
2. Replace `PASTE-GOOGLE_SHEET_SECRET-HERE` with the real secret
   (Supabase secret `GOOGLE_SHEET_SECRET`; also in the maintainer's
   `.env.cron.local`), and `PASTE-SUPABASE-ANON-KEY-HERE` with the app's public
   key (`VITE_SUPABASE_ANON_KEY` in `frontend/.env.local`). Supabase refuses a
   function call with no `Authorization` header, so the public key is sent as
   bearer; the shared secret is what actually proves the call came from the
   spreadsheet.
3. **Deploy → Manage deployments → pencil → Version: New version → Deploy.**
   - Not *New deployment* — that creates a new URL and every sign-up will fail
     until Supabase secret `GOOGLE_SHEET_WEBHOOK_URL` is updated.
4. Open the /exec URL in a browser. `{"ok":true,...}` means it's working.

### Good to know
- The script runs **as the Google account that deployed it**. If that account
  loses access to the spreadsheet, every sign-up fails with an authorisation
  error — the red banner will say so. Redeploy from an account that has access.
- Rows are **append-only**: existing form responses are never changed.
- Pressing **Run** on `doPost` in the Apps Script editor always errors
  ("Cannot read properties of undefined") — it needs a real request. That's normal.

---

## Where each piece lives

| Piece | Location |
|---|---|
| Settings | Spreadsheet → **Sync settings** tab |
| Sheet script | Spreadsheet → Extensions → Apps Script (source: `integrations/google-sheet-lead-sync.gs`) |
| Sender | Supabase Edge Function `sync-lead-to-sheet` |
| Daily retry + alert | Supabase Edge Function `daily-checks` (called daily by cron-job.org) |
| Secrets | Supabase: `GOOGLE_SHEET_WEBHOOK_URL`, `GOOGLE_SHEET_SECRET` |
| Per-prospect status | `FollowUpContact.sheetSyncedAt`, `sheetSyncError`, `sheetSyncWarning` |
