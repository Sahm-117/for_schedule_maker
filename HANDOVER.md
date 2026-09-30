# Taking over FOF Ops

This is for whoever runs FOF Ops next, and for whoever is leaving. It says where everything lives,
what to hand over, and how to make a change safely, by hand or with Claude Code. No passwords are
written here. Every secret is named below and its value lives in the team's password manager.

## 1. The short version

FOF Ops is a web app (installable on phones) for running the Foundation of Faith programme.

| Piece | What it is | Where it lives |
|---|---|---|
| The app's code | React website, in `frontend/` | GitHub: `Sahm-117/for_schedule_maker` (public repo) |
| The live website | Built and hosted automatically | Vercel, project deployed from the `main` branch |
| Data, logins, files, scheduled jobs, server functions | The database and server side | Supabase project "FOF Schedule Editor" (Free plan, region eu-west-2) |
| Nightly backup and restore check | Automatic | GitHub Actions in the same repo |

**Pushing to `main` changes the live app within a couple of minutes.** There is no test site between
your change and the real one, so check before you push.

## 2. Accounts you need

Get yourself added as an **owner** on each. Collaborator access is not enough to move things on.

| Account | What it controls | How to get in |
|---|---|---|
| **GitHub**, the `Sahm-117/for_schedule_maker` repo | Code, history, backups, secrets, failure emails | The owner adds you under repo Settings → Collaborators, or transfers the repo (Settings → Danger zone → Transfer) |
| **Vercel** | The live website and its settings | Owner invites you to the team/project. Project settings: root directory `frontend`, build `npm run build` |
| **Supabase**, organisation "Awesohme's Org" | Database, server functions, secrets, project settings | Owner adds you under Organization → Team as Owner |
| Email (Resend), Telegram bot, OpenRouter (AI), a Google Sheet + Apps Script | Sends emails and alerts, AI helper, syncs sign-ups to a sheet | Each has its own login; the keys are in Supabase function secrets (section 3) |

## 3. Where the secrets are (names only)

- **GitHub** → repo → Settings → Secrets and variables → Actions: `SUPABASE_DB_PASSWORD`,
  `SUPABASE_SERVICE_ROLE_KEY`, `BACKUP_PASSPHRASE`. The nightly backup and the restore check use them.
- **Vercel** → project → Settings → Environment Variables: `VITE_SUPABASE_URL`,
  `VITE_SUPABASE_ANON_KEY`, `VITE_VAPID_PUBLIC_KEY`. (Anything starting `VITE_` ends up in the browser,
  so it must never be private.)
- **Supabase** → Edge Functions → Secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VAPID_PUBLIC_KEY`,
  `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `CRON_SECRET`, `APP_URL`, `APP_BASE_URL`, `RESEND_API_KEY`,
  `RESEND_FROM_EMAIL`, `OPENROUTER_API_KEY`, `GOOGLE_SHEET_SECRET`, `GOOGLE_SHEET_WEBHOOK_URL`, and the
  `TELEGRAM_*` ones.
- **Supabase Vault** (Project → Integrations → Vault): `project_url` and `push_reminders_service_key`. The
  scheduled jobs use these to call the server functions. If they are missing, the reminders silently stop.
- **On a maintainer's own computer**, in a git-ignored `.env.local`: the service-role key, the database
  password and a Supabase access token. Never commit this.

**Do not change the VAPID keys.** Every phone that turned on notifications is tied to them; changing them
silently stops pushes for everyone until each person turns notifications on again.

**Keep `BACKUP_PASSPHRASE` in a password manager.** Without it no backup can be opened.

## 4. If you are the one leaving

Do these in order, and don't remove yourself from anything until the new person has confirmed step 5.

1. Add the new owner on GitHub, Vercel and Supabase (section 2).
2. Put every secret named in section 3 into the shared password manager, and share it with the new owner.
3. On GitHub, set your notification email so failure emails go to the **new** owner too (the new owner
   should also watch the repo: Watch → All activity, or at least Actions). The backup and restore-check
   failure emails go to whoever owns or triggers the workflow.
4. Tell them what is still open (section 9).
5. The new person checks they can do each of these: open the live site and sign in as admin; open the
   Supabase dashboard and see the tables; open Vercel and see the last deploy; open GitHub → Actions and see
   a green Nightly Database Backup and Backup Restore Check.
6. Then clean up your own access:
   - Delete any personal access tokens you made (GitHub → Settings → Developer settings; Supabase →
     Account → Access Tokens; Vercel → Account → Tokens).
   - Remove yourself from each account.
   - If you ever pasted a key into chat, email or a file outside the password manager, change it. Changing
     the service-role key or the database password means updating the GitHub secrets, the Supabase function
     secrets and the Vault entry named in section 3.

## 5. If you are taking over: first day

1. Accept the three invites (section 2).
2. Get the code and run it:
   ```sh
   git clone https://github.com/Sahm-117/for_schedule_maker.git
   cd for_schedule_maker/frontend
   npm install
   cp .env.example .env.local      # fill in the three VITE_ values from Vercel
   npm run dev                     # http://localhost:5173
   ```
   The local app talks to the **real** database. There is no separate test database, so what you do
   while signed in is real.
3. Read `README.md` (what the app does), `AGENTS.md` (the working rules), and the newest file in
   `.sessions/` (what was last done and what is open).

## 6. Making a change

1. Make it in `frontend/src/`. Follow `AGENTS.md`: the page and menu layout, portal overlays, no native
   dropdowns, keep changes small.
2. Check it: `cd frontend && npm run build` must pass, and open the changed screen in the browser as the
   role that uses it (admin, support or participant). Clean up any test data you created.
3. `git add`, `git commit`, `git push origin main`. Vercel deploys in about two minutes. Reload the site (on
   phones: close and reopen the app once) to see it.
4. A mistake is undone by pushing a fix or `git revert <commit>` and pushing again.

**Database changes** are files in `supabase/migrations/` named with a timestamp. The project has no
automatic migration runner: a migration is applied by hand (paste it into Supabase → SQL Editor, or run it
with the Supabase CLI), and then **checked against the live database** (for example, run the function as
each role, and confirm the public key is refused where it should be). Commit the file so the history is
kept. Never change the live database without a migration file to match.

**Server functions** (`supabase/functions/`) are deployed with the Supabase CLI:
```sh
npm i -g supabase
supabase login
supabase link --project-ref <the project ref, see .github/workflows/db-backup.yml>
supabase functions deploy <function-name>
```
Saving the code in the repo does not deploy it.

## 7. Working with Claude Code

Claude Code can do all of section 6 for you. To set it up:

1. Install Claude Code and open a terminal in the repo folder, then run `claude`.
2. It reads `AGENTS.md` by itself. Start by telling it: *"Read the latest handoff in `.sessions/` and
   `HANDOVER.md`."*
3. To let it inspect or change the live database, give it a Supabase access token and project ref in the
   git-ignored `.env.local` (Supabase → Account → Access Tokens). Without them it can still change code but
   not check the database.
4. Good habits that this project already follows: ask it to **show previews before it builds**, say
   "build and push" when you want it live, ask it to **verify database changes against the live
   database**, and ask for test data to be cleaned up.
5. Commits are authored as the repo owner's name and email (see `git log`). `AGENTS.md` asks it to keep
   that, and to ask before changing it. Set `git config user.name` and `user.email` to your own once, and
   tell it to keep yours.
6. When a piece of work is finished, ask it to add a short note to `.sessions/` and `.sessions/INDEX.md`. That
   is how the next person (or the next Claude session) learns what happened. The folder is git-ignored but
   its files are committed with `git add -f`.

## 8. Things that run on their own

- **Nightly backup** (2:30 UTC) and **Backup Restore Check**: GitHub Actions. See `BACKUP_RESTORE.md`.
- **Keep-alive**: a daily GitHub Action pings the database so the Free plan doesn't pause it. See
  `KEEP_ALIVE_SETUP.md`.
- **Scheduled database jobs** (Supabase → Integrations → Cron): push reminders every 10 minutes,
  follow-up assignment every 10 minutes, attendance windows closing every minute, Sunday attendance at
  noon, old reminder logs cleaned nightly, public holidays refreshed twice a month. They call the server
  functions through the two Vault entries in section 3.
- **Server functions**: 18 in `supabase/functions/`. They send notifications, emails and the sheet sync,
  and assign follow-ups.

## 9. Good to know

- **The browser key is public by design.** The "anon" key is in the website's code; anyone can read it.
  Safety comes from each table's rules inside Supabase. New tables must be closed to that key unless there
  is a reason. Staff and participant data are reached only through checked functions.
- **Free plan**: no automatic Supabase backups (that is why the nightly one exists). Upgrading to Pro adds
  daily backups and optional point-in-time recovery.
- **Open items at handover** (also in the newest `.sessions/` note): a leadership preview test login may
  still need deleting; two participant records share a phone number with earlier-cohort people and need a
  human decision; the recap files in Storage may be readable by anyone who has a direct link (not checked).
