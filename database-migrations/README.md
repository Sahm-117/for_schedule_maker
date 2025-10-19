# Database Migrations

This directory contains manual SQL migration scripts for database schema updates.

## Migration Files

### `supabase-schema-update.sql`
**Purpose:** Initial database setup for FOF Schedule Editor

**What it does:**
- Creates weeks 2-8 (week 1 should exist from Prisma migration)
- Adds days for all weeks in correct order (Sunday → Saturday)
- Ensures FOF-specific day ordering

**When to use:**
- Initial Supabase database setup
- Recovering from incomplete migrations
- Setting up development/staging databases

**How to run:**
```sql
-- In Supabase SQL Editor (Dashboard → SQL Editor)
-- 1. Paste contents of supabase-schema-update.sql
-- 2. Click "Run"
-- 3. Verify: SELECT * FROM "Week" ORDER BY "weekNumber";
```

## Prisma Migrations

The primary migration system uses **Prisma**. Migrations are stored in `backend/prisma/migrations/`.

### Applying Prisma Migrations

**Development:**
```bash
cd backend
npx prisma migrate dev
```

**Production:**
```bash
cd backend
npx prisma migrate deploy
```

### Current Prisma Migrations
1. `20251004104546_init` - Initial schema
2. `20251005162158_add_userid_to_activity` - Add user tracking
3. `20251010211441_add_onboarding_completed` - Onboarding system
4. `20251013000000_add_onboarding_replay_tracking` - Replay tracking

## Migration Strategy

### For Schema Changes

**Always use Prisma:**
1. Update `backend/prisma/schema.prisma`
2. Run `npx prisma migrate dev --name descriptive_name`
3. Commit migration files
4. Deploy with `npx prisma migrate deploy`

### For Data Migrations

**Use scripts in `/scripts` directory:**
- See `/scripts/team-migration/` for team data migration
- See `/scripts/database-utilities/` for maintenance scripts

## Rollback Strategy

Prisma migrations are **not reversible by default**. To rollback:

1. **Backup database first:**
   ```bash
   # Use Supabase dashboard or pg_dump
   pg_dump $DATABASE_URL > backup.sql
   ```

2. **Manual rollback:**
   - Review migration SQL in `backend/prisma/migrations/`
   - Write reverse SQL manually
   - Test on staging first

3. **Nuclear option:**
   ```bash
   # WARNING: Destroys all data
   npx prisma migrate reset
   ```

## Database Seeding

After migrations, seed initial data:

```bash
cd backend
npm run db:seed
```

**What it seeds:**
- 8 weeks (Week 1 - Week 8)
- 7 days per week (Sunday - Saturday)
- Default admin user (check seed file for credentials)
- Default teams (if team migration completed)

## Troubleshooting

### "Relation already exists"
The database already has this table. Safe to ignore if structure matches.

### "Migration failed"
1. Check Supabase logs (Dashboard → Logs)
2. Verify DATABASE_URL is correct
3. Ensure Supabase connection is active
4. Check for schema conflicts

### "Out of sync"
Prisma schema doesn't match database:
```bash
npx prisma db push  # Force sync (development only)
npx prisma migrate resolve --applied <migration_name>  # Mark as applied
```

## Best Practices

1. **Always backup before migrations**
2. **Test migrations on staging first**
3. **Run migrations during low-traffic periods**
4. **Use Prisma for schema changes** (not raw SQL)
5. **Document manual migrations** in this directory
6. **Keep migration files in version control**

## Schema Diagram

```
Week (1-8)
 └─ Day (Sunday-Saturday)
     └─ Activity (time, description, period, orderIndex)
         └─ ActivityTeam (junction table)
             └─ Team (name, color)

User (Admin/Support)
 ├─ Activity (created activities)
 ├─ PendingChange (change requests)
 └─ RejectedChange (rejected requests)
```

---

**For team-specific migrations, see:** `/scripts/team-migration/`
**For Prisma migrations, see:** `backend/prisma/migrations/`
