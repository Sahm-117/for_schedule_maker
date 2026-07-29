# Schedule maintenance scripts

One-off / occasional scripts for managing Cohort 9 activity labels via the Supabase
REST API. Assignment in the app works through **labels**: tagging an activity with a
`Group N Support` label makes it "owned" by whoever holds that label, which is what
drives their notifications and the Support-person filter.

## Setup (secrets — never commit these)

Add to the repo-root `.env.local` (already gitignored):

```
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role JWT>
# optional, defaults to Cohort 9:
# COHORT_ID=<cohort uuid>
```

`_supabase.js` reads these (and falls back to `VITE_SUPABASE_URL`). The service-role
key bypasses RLS — keep it out of git.

## Scripts

Every script is **dry-run by default**; add `--apply` to write.

### `backup-activity-labels.js`
Back up / restore the `ActivityLabel` table. Run before any destructive change.
```
node scripts/backup-activity-labels.js                     # save timestamped JSON
node scripts/backup-activity-labels.js --restore <file>    # re-insert saved rows
```

### `reconcile-golive-labels.js`  ✅ already run once
Go-live state: only **Inspirational Scriptures** activities keep a label; everything
else is stripped so only Inspirational posts notify at publish. Also sets the
resolved Scriptural-Posting rota (Wk3 & Wk8 → Group 29, Wk6 → Group 16). Weeks with
unresolved names are left as-is for manual assignment.
```
node scripts/reconcile-golive-labels.js            # dry run
node scripts/reconcile-golive-labels.js --apply
```
