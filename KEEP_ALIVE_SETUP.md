# Keep-Alive Setup for FOF Scheduler

Free-tier Supabase projects pause after **7 days of inactivity**. This app talks
to Supabase directly (the frontend uses `VITE_DATA_PROVIDER=supabase`), so the
database must receive at least one request every few days or it will pause and
the app will appear "down" until the next request wakes it.

## ✅ Current mechanism (live)

**GitHub Actions cron** — `.github/workflows/keep-alive.yml`

- Runs daily at 06:00 UTC (`workflow_dispatch` also lets you trigger it manually
  from the repo's **Actions** tab).
- Sends a lightweight authenticated `GET` to the Supabase REST API.
- Fails (sending you the standard GitHub Actions failure email) only if Supabase
  is unreachable or returns 5xx — so it doubles as a basic uptime alert.
- The anon key in the workflow is already public (it ships in the frontend
  bundle), so there is no secret to protect. If you rotate the project, update
  the URL + key in the workflow.

No external service or account is required — it runs on GitHub's free Actions
minutes.

## ⚠️ Note on the old Express backend

Earlier versions documented a `/api/keep-alive` route in the Express backend
(`backend/src/routes/keepAlive.ts`). **That path is no longer used in
production** — the app now calls Supabase directly and the Express backend is not
deployed. Ignore the old UptimeRobot/Express instructions; the GitHub Action
above is the single source of truth.

## 🧪 Testing

Trigger the workflow manually:

1. Open the repo on GitHub → **Actions** → **Keep Supabase Alive**.
2. Click **Run workflow**.
3. The run log prints `Supabase REST responded: 200`.

Or test the endpoint directly:

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "apikey: <ANON_KEY>" -H "Authorization: Bearer <ANON_KEY>" \
  "https://vnmeeqvwqaeczjlvzoul.supabase.co/rest/v1/Cohort?select=id&limit=1"
# 200 = alive
```

## 🎯 Want stronger uptime?

A daily ping prevents the 7-day pause but does **not** give you a real uptime
SLA. For higher availability you would need **Supabase Pro** (no auto-pause,
daily backups) — a paid tier. On free tier, this Action is the best available
safeguard.
