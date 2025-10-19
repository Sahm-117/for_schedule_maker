# Scripts Directory

This directory contains utility scripts for database management, migrations, and maintenance.

## Directory Structure

```
scripts/
├── archive/              # Backup files and historical data
├── database-utilities/   # General database maintenance scripts
├── team-migration/       # Team color tagging migration scripts
├── documentation/        # Detailed guides and documentation
└── README.md            # This file
```

## Quick Start

All scripts require environment variables to be set. Create a `.env` file in the project root with:

```env
SUPABASE_URL=your-supabase-url
SUPABASE_SERVICE_KEY=your-service-key
DATABASE_URL=postgresql://...
```

## Database Utilities

**Location:** `database-utilities/`

### Check Scripts
- `test-connection.js` - Verify Supabase connection
- `check-days.js` - Verify day records integrity
- `check-weeks.js` - Verify week records integrity

### Duplicate Management
- `find-duplicates.js` - Find duplicate activities across weeks
- `investigate-duplicates.js` - Detailed duplicate analysis
- `cleanup-duplicates.js` - Remove duplicate activities (with backup)
- `cleanup-same-day-duplicates.js` - Remove duplicates within same day

**Usage:**
```bash
cd scripts/database-utilities
node test-connection.js
node find-duplicates.js
```

## Team Migration

**Location:** `team-migration/`

### Migration Files
- `SUPABASE_MIGRATION.sql` - SQL to create Team and ActivityTeam tables
- `SUPABASE_MIGRATION_CLEAN.sql` - Clean migration (alternative version)
- `migrate-teams-from-descriptions.js` - Extract teams from activity descriptions
- `create-team-tables.js` - Create team tables via script

### Team Management
- `auto-assign-group-support-teams.js` - Auto-assign "Group Support" team
- `check-teams.js` - Verify team data
- `test-teams-query.js` - Test team queries
- `fix-team-migration.js` - Fix migration issues

### Migration Steps

1. **Run SQL Migration**
   ```sql
   -- In Supabase SQL Editor
   -- Paste contents of team-migration/SUPABASE_MIGRATION.sql
   -- Click Run
   ```

2. **Migrate Existing Data**
   ```bash
   cd scripts/team-migration
   node migrate-teams-from-descriptions.js
   ```

3. **Verify Migration**
   ```bash
   node check-teams.js
   node test-teams-query.js
   ```

See `documentation/TEAM_MIGRATION_GUIDE.md` for detailed instructions.

## Archive

**Location:** `archive/`

Contains backup files created during migrations and cleanups. Format: `backup-activities-{timestamp}.json`

## Safety Features

- All destructive scripts create automatic backups
- Backups stored in `archive/` directory
- Scripts are idempotent (safe to re-run)
- Detailed logging for all operations

## Documentation

**Location:** `documentation/`

- `TEAM_MIGRATION_GUIDE.md` - Comprehensive team migration guide
- Additional guides as needed

## Common Issues

### Connection Errors
```bash
# Test connection first
node database-utilities/test-connection.js
```

### Missing Environment Variables
Ensure `.env` file exists in project root with all required variables.

### Permission Errors
Use service key (not anon key) for administrative scripts.

## Best Practices

1. Always test connection before running scripts
2. Review backup files before deleting
3. Run check scripts after migrations
4. Keep archive files for at least 30 days

## Support

For issues or questions, check:
1. Script error messages (usually descriptive)
2. Supabase logs (Dashboard → Logs)
3. Archive backups (for data recovery)
4. Documentation files in `documentation/`

---

**Last Updated:** January 2025
**Maintainer:** FOF Development Team
