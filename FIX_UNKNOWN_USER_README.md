# How to Fix the "Unknown User" Issue

## 🚨 Quick Fix (2 Steps)

### Step 1: Diagnose the Problem
Run `diagnose-unknown-user.sql` in your Supabase SQL Editor

**This will show you:**
- ✅ How many orphaned pending changes exist
- ✅ If System Admin user exists
- ✅ What data is being sent to the UI
- ✅ All users in your database
- ✅ Any invalid user IDs

### Step 2: Apply the Fix
Run `fix-unknown-user-final.sql` in your Supabase SQL Editor

**This will:**
- ✅ Create System Admin user if missing
- ✅ Create fallback admin if needed
- ✅ Fix ALL orphaned pending changes
- ✅ Verify the fix worked
- ✅ Show you the results

---

## 📋 Expected Results

### After Step 1 (Diagnosis):
You should see something like:
```
orphaned_count: 2    ← This means 2 pending changes have no user
System Admin: NULL   ← This means System Admin doesn't exist
```

### After Step 2 (Fix):
You should see:
```
total_pending_changes: 2
with_valid_user: 2
still_orphaned: 0

✅ SUCCESS! All pending changes now have valid users!
```

---

## 🔍 What Each Script Does

### `diagnose-unknown-user.sql`
**Safe to run** - Only reads data, doesn't modify anything
- Checks for orphaned records
- Verifies System Admin exists
- Shows current state of pending changes
- Lists all users
- Identifies invalid user IDs

### `fix-unknown-user-final.sql`
**Modifies database** - Run this to fix the issue
- Creates System Admin user
- Creates fallback admin if needed
- Updates all orphaned pending changes
- Verifies the fix
- Shows results

---

## 🎯 After Running the Fix

1. **Refresh your browser** (Ctrl+Shift+R or Cmd+Shift+R)
2. **Check pending changes** - Should now show real user names
3. **Create a new activity** - Should work without "Unknown User"

---

## 🐛 Still Seeing "Unknown User"?

If you still see "Unknown User" after running both scripts:

### Check 1: Browser Cache
```bash
# Hard refresh your browser
Ctrl + Shift + R (Windows/Linux)
Cmd + Shift + R (Mac)
```

### Check 2: Dev Server
```bash
# Restart your frontend dev server
cd frontend
npm run dev
```

### Check 3: Verify in Database
Run this query in Supabase:
```sql
SELECT COUNT(*) FROM "PendingChange" pc
LEFT JOIN "User" u ON u.id = pc."userId"
WHERE u.id IS NULL;
-- Should return 0
```

### Check 4: Frontend Code
Verify these files have the correct fallback:
- `frontend/src/components/ActivityModal.tsx:144`
- `frontend/src/services/supabase-api.ts:348, 535`
- `frontend/src/components/CrossWeekModal.tsx:79`

All should have:
```typescript
userId: user?.id || 'a0000000-0000-4000-8000-000000000002'
```

---

## 📞 Need Help?

Share the output of `diagnose-unknown-user.sql` with another developer or LLM.
The comprehensive guide is in `UNKNOWN_USER_ISSUE_SUMMARY.md`.
