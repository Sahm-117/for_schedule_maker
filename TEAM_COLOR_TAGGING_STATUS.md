# Team Color Tagging System - Implementation Status

**Last Updated:** October 12, 2025
**Status:** Phase 1 Complete (Database & API) | Phase 2-4 Pending (UI & Display)

---

## ✅ Phase 1: Database & API (COMPLETED)

### Database Schema
- ✅ **Team Table** created with:
  - `id` (serial primary key)
  - `name` (unique text)
  - `color` (hex code string)
  - `createdAt`, `updatedAt` (timestamps)

- ✅ **ActivityTeam Junction Table** created with:
  - `activityId` (foreign key to Activity)
  - `teamId` (foreign key to Team)
  - `order` (integer for selection order)
  - Composite primary key on (activityId, teamId)
  - Cascade delete on both sides

### Backend API (Express + Prisma)
- ✅ `/api/teams` - GET all teams
- ✅ `/api/teams` - POST create team (admin only)
- ✅ `/api/teams/:id` - PATCH update team (admin only)
- ✅ `/api/teams/:id` - DELETE delete team (admin only)
- ✅ Hex color validation (#FF5733 format)
- ✅ Unique team name enforcement

### Frontend API (Supabase)
- ✅ `teamsApi.getAll()` - Fetch all teams
- ✅ `teamsApi.create()` - Create new team
- ✅ `teamsApi.update()` - Update team name/color
- ✅ `teamsApi.delete()` - Delete team
- ✅ `teamsApi.getActivityTeams(activityId)` - Get teams for activity
- ✅ `teamsApi.assignTeamsToActivity(activityId, teamIds)` - Assign multiple teams

### Migration Tools
- ✅ `SUPABASE_MIGRATION.sql` - SQL to create Team & ActivityTeam tables
- ✅ `migrate-teams-from-descriptions.js` - Extracts teams from "(Admin)" patterns
- ✅ `TEAM_MIGRATION_GUIDE.md` - Step-by-step instructions
- ✅ Automatic backup before migration
- ✅ Default team colors:
  - Admin → Blue (#3B82F6)
  - Support → Green (#10B981)
  - Group Support → Purple (#8B5CF6)
  - Class Management → Orange (#F59E0B)

---

## 🔄 Phase 2: Admin Team Management UI (PENDING)

### Requirements
1. **New Dashboard Tab: "Team Management"** (admin only)
   - List all teams with color preview
   - Create team button
   - Edit team (inline or modal)
   - Delete team with confirmation
   - Show activity count per team

2. **Color Picker Component**
   - **Predefined Color Pills** (8 colors):
     - Red (#EF4444)
     - Orange (#F59E0B)
     - Yellow (#FBBF24)
     - Green (#10B981)
     - Blue (#3B82F6)
     - Purple (#8B5CF6)
     - Pink (#EC4899)
     - Gray (#6B7280)
   - **Custom Color Wheel** for other colors
   - Selected color shows immediately

3. **Validation**
   - Team name required (min 2 chars)
   - Color must be valid hex code
   - Duplicate team names prevented
   - Delete confirmation if team has activities

### Implementation Steps
```
1. Create TeamManagement.tsx component
2. Add tab to Dashboard.tsx (after User Management)
3. Create TeamModal.tsx for add/edit
4. Create ColorPicker.tsx component
5. Connect to teamsApi
6. Add loading states and error handling
```

---

## 🔄 Phase 3: Activity Modal Team Selection (PENDING)

### Requirements
1. **Team Selection Field** (under description)
   - **If ≤ 4 teams:** Show checkboxes (multi-select)
   - **If > 4 teams:** Show multi-select dropdown
   - Teams ordered by creation date
   - Selected teams shown as colored pills/badges

2. **Visual Design**
   - Label: "Teams (optional)"
   - Checkbox/Dropdown with team names
   - Color dot/square next to each team name
   - Selected teams show below field as colored badges
   - Remove team by clicking X on badge

3. **Save Behavior**
   - Save selected teamIds to ActivityTeam table
   - Maintain selection order
   - Works for both ActivityModal and CrossWeekModal
   - Admin: Direct save
   - Support: Submitted with pending change

### Implementation Steps
```
1. Update ActivityModal.tsx - add team selection
2. Update CrossWeekModal.tsx - add team selection
3. Create TeamSelector.tsx component
4. Update activitiesApi.create() to accept teamIds
5. Update pendingChangesApi to include teamIds
6. Call teamsApi.assignTeamsToActivity() after save
```

---

## 🔄 Phase 4: Display Teams in Schedule (PENDING)

### Requirements
1. **Schedule View (DaySchedule.tsx)**
   - Display format: `"Prayer Watch Post (Admin, Support)"`
   - Each team name in its designated color
   - Multiple teams comma-separated
   - Teams ordered by selection order

2. **Activity Modal (View Mode)**
   - Show assigned teams as colored badges
   - Below description field or in header

3. **Search Results**
   - Include team names in search
   - Highlight team names in color

### Implementation Steps
```
1. Fetch activity teams when loading activities
2. Update Activity type to include teams[]
3. Update DaySchedule.tsx to render teams
4. Create TeamBadge.tsx component
5. Add CSS for inline team colors
```

---

## 🔄 Phase 5: PDF Export with Colored Teams (PENDING)

### Requirements
1. **PDF Format**
   - Activities show: `"06:00 AM - Prayer Watch Post (Admin, Support)"`
   - Team names in parentheses
   - **Colored text** for team names (jsPDF supports this)

2. **Color Rendering**
   ```typescript
   pdf.setTextColor(35, 130, 246); // Blue
   pdf.text("(Admin)", x, y);
   pdf.setTextColor(0, 0, 0); // Reset to black
   ```

### Implementation Steps
```
1. Update pdfExport.ts
2. Fetch teams for each activity
3. Append team names to description
4. Apply team colors in PDF
5. Test with multiple teams
```

---

## 📋 Next Steps (In Order)

### Immediate (Run These First)
1. **Run `SUPABASE_MIGRATION.sql` in Supabase Dashboard**
   - Go to Supabase → SQL Editor
   - Paste contents of `scripts/SUPABASE_MIGRATION.sql`
   - Click Run

2. **Run Data Migration Script**
   ```bash
   cd scripts
   node migrate-teams-from-descriptions.js
   ```
   - This will extract teams from existing activities
   - Creates backup automatically
   - Default teams will be created with colors

3. **Verify Migration**
   - Check Supabase tables: Team & ActivityTeam
   - Verify activities no longer have "(Team)" in descriptions
   - Confirm teams are assigned correctly

### Development (After Migration)
1. Build Team Management UI (Phase 2)
2. Add Team Selection to Activity Modals (Phase 3)
3. Display Teams in Schedule View (Phase 4)
4. Update PDF Export (Phase 5)
5. Test entire flow end-to-end
6. Deploy to production

---

## 🧪 Testing Checklist (After All Phases)

### Admin Flow
- [ ] Admin can create teams with custom colors
- [ ] Admin can edit team names and colors
- [ ] Admin can delete teams (removes from activities)
- [ ] Admin can assign multiple teams to activities
- [ ] Teams show in schedule with correct colors
- [ ] PDF export includes colored team names

### Support Flow
- [ ] Support can select teams when creating activities
- [ ] Support's pending changes include team assignments
- [ ] Admin can see team selections in pending changes
- [ ] After approval, teams are assigned correctly
- [ ] Support can see team colors in schedule

### Edge Cases
- [ ] No teams selected (optional field)
- [ ] Deleting a team removes it from all activities
- [ ] Duplicate team names prevented
- [ ] Invalid hex colors rejected
- [ ] More than 4 teams switches to dropdown
- [ ] Teams maintain selection order
- [ ] Cross-week activities get teams on all weeks

---

## 📁 Files Modified/Created

### Database
- `backend/prisma/schema.prisma` - Added Team & ActivityTeam models

### Backend
- `backend/src/routes/teams.ts` - Team CRUD routes (NEW)
- `backend/src/index.ts` - Registered teams routes

### Frontend
- `frontend/src/services/supabase-api.ts` - Added teamsApi

### Scripts
- `scripts/SUPABASE_MIGRATION.sql` - SQL migration (NEW)
- `scripts/TEAM_MIGRATION_GUIDE.md` - Instructions (NEW)
- `scripts/migrate-teams-from-descriptions.js` - Data migration (NEW)
- `scripts/create-team-tables.js` - Helper script (NEW)

### To Be Created (Phases 2-5)
- `frontend/src/components/TeamManagement.tsx`
- `frontend/src/components/TeamModal.tsx`
- `frontend/src/components/ColorPicker.tsx`
- `frontend/src/components/TeamSelector.tsx`
- `frontend/src/components/TeamBadge.tsx`
- Updates to: `ActivityModal.tsx`, `CrossWeekModal.tsx`, `DaySchedule.tsx`, `pdfExport.ts`

---

## 🎨 Design Specs

### Predefined Colors
| Color | Hex Code | Preview |
|-------|----------|---------|
| Red | #EF4444 | 🔴 |
| Orange | #F59E0B | 🟠 |
| Yellow | #FBBF24 | 🟡 |
| Green | #10B981 | 🟢 |
| Blue | #3B82F6 | 🔵 |
| Purple | #8B5CF6 | 🟣 |
| Pink | #EC4899 | 🩷 |
| Gray | #6B7280 | ⚪ |

### Team Display Format
- **Schedule**: `"Prayer Watch Post (Admin, Support)"`
- **PDF**: `"06:00 AM - Prayer Watch Post (Admin, Support)"`
- **Activity Modal**: Colored badges below description
- **Team Pills**: Rounded, colored background, white text

---

## 🚀 Deployment Notes

1. **Database Migration Required**: Run SQL migration first
2. **Data Migration Recommended**: Run data migration to extract existing teams
3. **No Breaking Changes**: Existing functionality unaffected
4. **Backward Compatible**: Activities without teams still work
5. **Progressive Enhancement**: Add teams to new activities gradually

---

## 💡 Future Enhancements (Nice to Have)

- **Team Categories**: Group teams (e.g., "Ministry", "Support", "Leadership")
- **Team Icons**: Allow emoji or icon selection
- **Team Permissions**: Restrict certain teams to certain users
- **Team Statistics**: Show which teams are most active
- **Team Templates**: Preset team configurations
- **Team Notifications**: Alert specific teams when mentioned
- **Team Colors in Notifications**: Email/Telegram with team colors

---

## 📞 Support

If you encounter issues:
1. Check `scripts/backup-activities-*.json` for data backup
2. Review `TEAM_MIGRATION_GUIDE.md` for troubleshooting
3. Check Supabase logs for SQL errors
4. Migration script is idempotent (safe to re-run)

---

**Ready for Phase 2!** Run the migrations first, then continue with UI implementation.
