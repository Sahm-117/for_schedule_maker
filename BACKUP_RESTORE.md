# Backups and restoring

Every night at 02:30 UTC, GitHub takes a full copy of the database and all uploaded files
(workflow: `.github/workflows/db-backup.yml`). Each copy is kept for 90 days.

The copy is locked with a passphrase (the `BACKUP_PASSPHRASE` repo secret). **Keep that
passphrase in your password manager.** Without it, no backup can be opened.

If a nightly run fails, GitHub emails the repo owner.

## Take a backup right now

GitHub → the repo → **Actions** → **Nightly Database Backup** → **Run workflow**.

## Restore after a disaster

You need: the passphrase, the database password of the new project, and a computer with
`gpg`, `psql` (PostgreSQL 17) and Node.js.

1. **Download the backup.** GitHub → **Actions** → **Nightly Database Backup** → open the
   latest green run → under *Artifacts*, download `fof-backup-YYYY-MM-DD`. Unzip it to get
   `fof-backup-YYYY-MM-DD.tar.gz.gpg`.
2. **Unlock it.**
   ```sh
   gpg -o backup.tar.gz -d fof-backup-YYYY-MM-DD.tar.gz.gpg   # asks for the passphrase
   tar -xzf backup.tar.gz                                     # creates ./backup
   ```
3. **Create a new Supabase project** (or use the existing one if it still exists and is empty).
   Copy its connection string from Project Settings → Database (Session pooler).
4. **Load the database**, in this order:
   ```sh
   psql --single-transaction --variable ON_ERROR_STOP=1 \
     --file backup/roles.sql --file backup/schema.sql \
     --command 'SET session_replication_role = replica' \
     --file backup/data.sql \
     --dbname "<connection string>"
   ```
5. **Re-upload files.** In the new project, create the buckets listed in
   `backup/storage/buckets.json` (same names, same public/private setting). Then upload each
   folder under `backup/storage/<bucket>/` into its bucket, keeping the same paths.
6. **Redeploy the server functions and settings**:
   ```sh
   supabase link --project-ref <new ref>
   supabase functions deploy
   supabase secrets set ...   # same function secrets as before
   ```
7. **Point the app at the new project.** Update `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY` in Vercel (and `.env.local`), then redeploy. Also update the URL
   and key in `.github/workflows/keep-alive.yml` and `PROJECT_REF` / `SUPABASE_URL` /
   `DB_HOST` in `.github/workflows/db-backup.yml`, plus the repo secrets.

## What's not in the backup

- Server function code and cron schedules defined outside the database. The code lives in
  `supabase/functions` in this repo.
- Function secrets (API keys and so on). Keep a copy in your password manager.
- Supabase Vault contents. The project holds 2 Vault secrets (checked 2026-09-24), which the
  scheduled cron jobs may rely on. Keep their values in your password manager and re-create
  them in the new project (Project Settings → Vault) after step 4.
