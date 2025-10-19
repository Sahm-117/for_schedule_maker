# Team Color Tagging System - Migration Guide

## Step 1: Create Database Tables in Supabase

1. Go to your **Supabase Dashboard**: https://app.supabase.com
2. Select your project
3. Click **SQL Editor** in the left sidebar
4. Click **New Query**
5. Copy the contents of `SUPABASE_MIGRATION.sql` and paste into the editor
6. Click **Run** (or press Cmd/Ctrl + Enter)

You should see: "Success. No rows returned"

## Step 2: Run Data Migration Script

This script will:
- Create a backup of all activities
- Extract team names from activity descriptions (e.g., "(Admin)", "(Group Support)")
- Create teams in the database with default colors
- Assign teams to activities
- Clean up activity descriptions (remove the team tags)

```bash
cd scripts
node migrate-teams-from-descriptions.js
```

Expected output:
```
🔄 Starting Team Migration from Activity Descriptions
═══════════════════════════════════════════════════
📦 Step 1: Creating backup...
✅ Backup created: backup-activities-xxxxx.json

🔍 Step 2: Analyzing activities...
Found 45 activities with team tags
Unique teams to create: Admin, Support, Group Support, Class Management

🎨 Step 3: Creating teams...
✅ Created team: "Admin" (#3B82F6)
✅ Created team: "Support" (#10B981)
✅ Created team: "Group Support" (#8B5CF6)
✅ Created team: "Class Management" (#F59E0B)

📝 Step 4: Updating activities...
✅ Updated 45 activities

✅ Migration complete!
```

## Step 3: Verify in App

1. Refresh your application
2. Activities should no longer have "(Team)" in descriptions
3. Teams should now be visible (once UI is built)

## Troubleshooting

### "Error: relation 'Team' does not exist"
- You haven't run the SQL in Supabase yet
- Go back to Step 1

### "No activities with team tags found"
- Your activities don't have patterns like "(Admin)" or "(Group Support)"
- You can manually create teams later through the Admin UI

### "Backup created but no teams extracted"
- Check your activity descriptions
- The script looks for patterns at the END of descriptions: `(TeamName)`
- Example: "Prayer Watch Post (Admin)" ✅
- Example: "(Admin) Prayer Watch Post" ❌ (won't match)

## Default Team Colors

| Team | Color | Hex Code |
|------|-------|----------|
| Admin | Blue | #3B82F6 |
| Support | Green | #10B981 |
| Group Support | Purple | #8B5CF6 |
| Class Management | Orange | #F59E0B |
| Other teams | Gray | #6B7280 |

## Files Created During Migration

- `backup-activities-[timestamp].json` - Backup of all activities before migration
- Keep this file until you verify everything works correctly
- You can delete it after confirming the migration was successful

## What's Next?

After successful migration:
1. Backend API endpoints will be created
2. Admin UI for managing teams will be added
3. Activity modals will show team selection
4. Schedule view will display teams with colors
5. PDF export will include colored team names

## Need Help?

If migration fails:
1. Check the backup file - your data is safe
2. Check Supabase logs for errors
3. The script is idempotent (safe to run multiple times)
