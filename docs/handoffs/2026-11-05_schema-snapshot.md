# Database schema snapshot

**Date:** 2026-11-05
**Area:** documentation, maintainer scripts
**Live changes:** none (the script only reads the live database's catalogue, with `read_only=true`)

## What was done

- `scripts/schema-snapshot.py` reads the live database's structure through the Supabase Management API and writes:
  - `docs/schema/schema.sql`: structure only, no data. Enums, sequences, tables (with checks, keys, comments and
    row-level security switched on), foreign keys, indexes, views, every function in full, policies, triggers and the
    `cron.schedule` lines for the scheduled jobs. Schemas `public` and `analytics`; objects owned by extensions are left out.
  - `docs/schema/SCHEMA.md`: the readable version. Counts, scheduled jobs, every table grouped by area (columns, null,
    default, what each column links to, which tables link here, policies, triggers, approximate rows), views, the
    functions the app may call (granted to `anon`) and the internal ones, and enums.
- README points to both files.

At the time of writing: 160 tables (all with row-level security), 6 views, 552 functions (377 callable by the app),
66 triggers, 93 policies, 10 enums, 11 scheduled jobs.

## How to use it

```
python3 scripts/schema-snapshot.py           # rewrite docs/schema/
python3 scripts/schema-snapshot.py --check   # exit 1 if the files are out of date
```

Needs `SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_REF` in the environment or the root `.env.local`. Python standard
library only. It works where the database port (5432) is blocked, because it uses HTTPS.

## Gotchas

- Run it after every migration applied live and commit the result with the migration, or the snapshot drifts.
- A new table whose name matches no pattern in `AREAS` (top of the script's Markdown section) is filed under "Other",
  and the script prints its name. Add a pattern rather than leaving it there.
- `schema.sql` is a reference, not a restore path. To rebuild, restore a nightly backup (`BACKUP_RESTORE.md`).
- Function bodies are copied as they are live. Before committing a fresh snapshot, scan it for anything that must
  not be public (keys, tokens, people's names or numbers). The first snapshot was checked: the only literals are the
  church FOF email and the Practice password, both already in migrations.
- Row counts are Postgres estimates (`reltuples`), so small tables can show 0 or be slightly off.

## Open items

- None.
