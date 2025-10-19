require('dotenv').config({ path: '../.env' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Default colors for auto-created teams
const DEFAULT_TEAM_COLORS = {
  'Admin': '#3B82F6',          // Blue
  'Support': '#10B981',        // Green
  'Group Support': '#8B5CF6',  // Purple
  'Class Management': '#F59E0B' // Orange
};

// Regex to extract team names from descriptions
// Matches: (Admin), (Group Support), (Admin, Support), etc.
const TEAM_PATTERN = /\s*\(([^)]+)\)\s*$/;

async function migrateTeamsFromDescriptions() {
  console.log('🔄 Starting Team Migration from Activity Descriptions\n');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Step 1: Create backup
  console.log('📦 Step 1: Creating backup of activities...');
  const { data: allActivities, error: fetchError } = await supabase
    .from('Activity')
    .select('*')
    .order('id', { ascending: true });

  if (fetchError) {
    console.error('❌ Error fetching activities:', fetchError);
    return;
  }

  const backupFile = `../scripts/backup-activities-${Date.now()}.json`;
  fs.writeFileSync(backupFile, JSON.stringify(allActivities, null, 2));
  console.log(`✅ Backup created: ${backupFile}`);
  console.log(`   Total activities backed up: ${allActivities.length}\n`);

  // Step 2: Analyze activities for team patterns
  console.log('🔍 Step 2: Analyzing activities for team patterns...\n');

  const activitiesWithTeams = [];
  const teamsToCreate = new Set();

  allActivities.forEach(activity => {
    const match = activity.description.match(TEAM_PATTERN);
    if (match) {
      const teamsPart = match[1];
      const teamNames = teamsPart.split(',').map(t => t.trim());
      const cleanDescription = activity.description.replace(TEAM_PATTERN, '').trim();

      activitiesWithTeams.push({
        id: activity.id,
        originalDescription: activity.description,
        cleanDescription,
        teams: teamNames
      });

      teamNames.forEach(team => teamsToCreate.add(team));
    }
  });

  console.log(`Found ${activitiesWithTeams.length} activities with team tags`);
  console.log(`Unique teams to create: ${Array.from(teamsToCreate).join(', ')}\n`);

  if (activitiesWithTeams.length === 0) {
    console.log('✅ No activities with team tags found. Migration complete!');
    return;
  }

  // Step 3: Create teams
  console.log('🎨 Step 3: Creating teams in database...\n');

  const createdTeams = {};

  for (const teamName of Array.from(teamsToCreate)) {
    const color = DEFAULT_TEAM_COLORS[teamName] || '#6B7280'; // Gray as fallback

    const { data: team, error: createError } = await supabase
      .from('Team')
      .insert({ name: teamName, color })
      .select()
      .single();

    if (createError) {
      console.error(`❌ Error creating team "${teamName}":`, createError);
    } else {
      createdTeams[teamName] = team;
      console.log(`✅ Created team: "${teamName}" (${color})`);
    }
  }

  console.log(`\n📊 Created ${Object.keys(createdTeams).length} teams\n`);

  // Step 4: Update activities
  console.log('📝 Step 4: Updating activities and assigning teams...\n');

  let updatedCount = 0;
  let errorCount = 0;

  for (const activityData of activitiesWithTeams) {
    // Update description (remove team tags)
    const { error: updateError } = await supabase
      .from('Activity')
      .update({ description: activityData.cleanDescription })
      .eq('id', activityData.id);

    if (updateError) {
      console.error(`❌ Error updating activity ${activityData.id}:`, updateError);
      errorCount++;
      continue;
    }

    // Assign teams
    for (let i = 0; i < activityData.teams.length; i++) {
      const teamName = activityData.teams[i];
      const team = createdTeams[teamName];

      if (!team) {
        console.error(`❌ Team "${teamName}" not found for activity ${activityData.id}`);
        continue;
      }

      const { error: assignError } = await supabase
        .from('ActivityTeam')
        .insert({
          activityId: activityData.id,
          teamId: team.id,
          order: i
        });

      if (assignError) {
        console.error(`❌ Error assigning team "${teamName}" to activity ${activityData.id}:`, assignError);
      }
    }

    updatedCount++;
    console.log(`✅ Updated activity ${activityData.id}: "${activityData.originalDescription}" → "${activityData.cleanDescription}" + ${activityData.teams.join(', ')}`);
  }

  // Step 5: Summary
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('📈 Migration Summary:');
  console.log('═══════════════════════════════════════════════════════════\n');
  console.log(`Total activities processed: ${allActivities.length}`);
  console.log(`Activities with teams: ${activitiesWithTeams.length}`);
  console.log(`Activities updated: ${updatedCount}`);
  console.log(`Errors: ${errorCount}`);
  console.log(`Teams created: ${Object.keys(createdTeams).length}`);
  console.log(`Backup location: ${backupFile}\n`);

  console.log('Teams created:');
  Object.entries(createdTeams).forEach(([name, team]) => {
    console.log(`  - ${name} (ID: ${team.id}, Color: ${team.color})`);
  });

  console.log('\n✅ Migration complete!\n');
  console.log('⚠️  Next steps:');
  console.log('   1. Verify activities in the app');
  console.log('   2. Check that team colors display correctly');
  console.log('   3. If everything looks good, you can delete the backup file\n');
}

migrateTeamsFromDescriptions().catch(console.error);
