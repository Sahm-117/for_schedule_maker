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

// Regex to extract team names from descriptions
const TEAM_PATTERN = /\s*\(([^)]+)\)\s*$/;

async function fixTeamMigration() {
  console.log('🔄 Fixing Team Migration - Cleaning Descriptions & Assigning Teams\n');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Step 1: Get all teams
  console.log('📋 Step 1: Fetching teams from database...');
  const { data: teams, error: teamsError } = await supabase
    .from('Team')
    .select('*');

  if (teamsError) {
    console.error('❌ Error fetching teams:', teamsError);
    return;
  }

  console.log(`✅ Found ${teams.length} teams`);
  teams.forEach(t => console.log(`   - ${t.name} (${t.color})`));
  console.log();

  // Create team lookup map
  const teamMap = {};
  teams.forEach(team => {
    teamMap[team.name] = team;
  });

  // Step 2: Get all activities with team patterns
  console.log('🔍 Step 2: Finding activities with team patterns...');
  const { data: allActivities, error: fetchError } = await supabase
    .from('Activity')
    .select('*')
    .order('id', { ascending: true });

  if (fetchError) {
    console.error('❌ Error fetching activities:', fetchError);
    return;
  }

  const activitiesWithTeams = [];

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
    }
  });

  console.log(`✅ Found ${activitiesWithTeams.length} activities with team tags\n`);

  if (activitiesWithTeams.length === 0) {
    console.log('✅ No activities with team tags found. All clean!');
    return;
  }

  // Step 3: Update activities
  console.log('📝 Step 3: Cleaning descriptions and assigning teams...\n');

  let updatedCount = 0;
  let errorCount = 0;

  for (const activityData of activitiesWithTeams) {
    console.log(`Processing activity ${activityData.id}...`);
    console.log(`  Original: "${activityData.originalDescription}"`);
    console.log(`  Clean: "${activityData.cleanDescription}"`);
    console.log(`  Teams: ${activityData.teams.join(', ')}`);

    // Update description (remove team tags)
    const { error: updateError } = await supabase
      .from('Activity')
      .update({ description: activityData.cleanDescription })
      .eq('id', activityData.id);

    if (updateError) {
      console.error(`  ❌ Error updating description:`, updateError.message);
      errorCount++;
      continue;
    }

    console.log(`  ✅ Description cleaned`);

    // Remove existing team assignments first
    await supabase
      .from('ActivityTeam')
      .delete()
      .eq('activityId', activityData.id);

    // Assign teams
    for (let i = 0; i < activityData.teams.length; i++) {
      const teamName = activityData.teams[i];
      const team = teamMap[teamName];

      if (!team) {
        console.log(`  ⚠️  Team "${teamName}" not found in database - skipping`);
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
        console.error(`  ❌ Error assigning team "${teamName}":`, assignError.message);
      } else {
        console.log(`  ✅ Assigned team: ${teamName}`);
      }
    }

    updatedCount++;
    console.log();
  }

  // Step 4: Summary
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📈 Fix Summary:');
  console.log('═══════════════════════════════════════════════════════════\n');
  console.log(`Total activities scanned: ${allActivities.length}`);
  console.log(`Activities with team tags: ${activitiesWithTeams.length}`);
  console.log(`Activities fixed: ${updatedCount}`);
  console.log(`Errors: ${errorCount}\n`);

  console.log('✅ Fix complete!\n');
  console.log('⚠️  Refresh your browser to see the cleaned descriptions and team assignments.');
}

fixTeamMigration().catch(console.error);
