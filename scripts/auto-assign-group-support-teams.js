require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Validate environment variables
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.error('❌ Error: Missing required environment variables');
  console.error('Please ensure SUPABASE_URL and SUPABASE_SERVICE_KEY are set in your .env file');
  process.exit(1);
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/**
 * Auto-assign Group Support activities to their corresponding week-specific teams
 *
 * For each week 1-8:
 * - Find all activities containing "group support" (case-insensitive)
 * - Assign them to the team "Group {weekNumber} Support"
 * - Replace any existing team assignments
 */
async function autoAssignGroupSupportTeams() {
  console.log('🔄 Starting Group Support team auto-assignment...\n');

  try {
    // Step 1: Fetch all Group Support teams (Group 1 Support through Group 8 Support)
    console.log('📋 Fetching Group Support teams...');
    const { data: teams, error: teamsError } = await supabase
      .from('Team')
      .select('id, name')
      .ilike('name', 'Group % Support')
      .order('name');

    if (teamsError) {
      throw new Error(`Failed to fetch teams: ${teamsError.message}`);
    }

    console.log(`✅ Found ${teams.length} Group Support teams:`);
    teams.forEach(team => console.log(`   - ${team.name} (ID: ${team.id})`));
    console.log('');

    // Create a mapping of week number to team ID
    const weekToTeamMap = {};
    teams.forEach(team => {
      // Extract week number from team name (e.g., "Group 1 Support" -> 1)
      const match = team.name.match(/Group (\d+) Support/i);
      if (match) {
        const weekNumber = parseInt(match[1]);
        weekToTeamMap[weekNumber] = team.id;
      }
    });

    console.log('📊 Week to Team mapping:');
    Object.entries(weekToTeamMap).forEach(([week, teamId]) => {
      const team = teams.find(t => t.id === teamId);
      console.log(`   Week ${week} → ${team.name} (ID: ${teamId})`);
    });
    console.log('');

    // Step 2: Process each week (1-8)
    let totalActivitiesUpdated = 0;
    let totalAssignmentsCreated = 0;

    for (let weekNumber = 1; weekNumber <= 8; weekNumber++) {
      const teamId = weekToTeamMap[weekNumber];

      if (!teamId) {
        console.log(`⚠️  Week ${weekNumber}: No corresponding "Group ${weekNumber} Support" team found. Skipping.`);
        continue;
      }

      console.log(`\n🔍 Processing Week ${weekNumber}...`);

      // Fetch all activities in this week that contain "group support" (case-insensitive)
      const { data: weekData, error: weekError } = await supabase
        .from('Week')
        .select(`
          id,
          weekNumber,
          Day (
            id,
            dayName,
            Activity (
              id,
              description
            )
          )
        `)
        .eq('weekNumber', weekNumber)
        .single();

      if (weekError) {
        console.log(`   ❌ Error fetching week ${weekNumber}: ${weekError.message}`);
        continue;
      }

      // Flatten activities and filter for "group support"
      const groupSupportActivities = [];
      weekData.Day?.forEach(day => {
        day.Activity?.forEach(activity => {
          if (activity.description.toLowerCase().includes('group support')) {
            groupSupportActivities.push({
              ...activity,
              dayName: day.dayName
            });
          }
        });
      });

      console.log(`   📌 Found ${groupSupportActivities.length} "Group Support" activities`);

      if (groupSupportActivities.length === 0) {
        console.log(`   ℹ️  No Group Support activities found in Week ${weekNumber}`);
        continue;
      }

      // Step 3: For each activity, replace team assignments
      for (const activity of groupSupportActivities) {
        console.log(`      🔧 Updating: "${activity.description}" (${activity.dayName})`);

        // Delete existing team assignments
        const { error: deleteError } = await supabase
          .from('ActivityTeam')
          .delete()
          .eq('activityId', activity.id);

        if (deleteError) {
          console.log(`         ❌ Failed to delete existing teams: ${deleteError.message}`);
          continue;
        }

        // Create new team assignment
        const { error: insertError } = await supabase
          .from('ActivityTeam')
          .insert([{
            activityId: activity.id,
            teamId: teamId,
            order: 0 // Single team, so order is 0
          }]);

        if (insertError) {
          console.log(`         ❌ Failed to assign team: ${insertError.message}`);
          continue;
        }

        console.log(`         ✅ Assigned to "Group ${weekNumber} Support"`);
        totalActivitiesUpdated++;
        totalAssignmentsCreated++;
      }
    }

    // Final summary
    console.log('\n' + '='.repeat(60));
    console.log('✨ Auto-assignment complete!');
    console.log(`📊 Total activities updated: ${totalActivitiesUpdated}`);
    console.log(`🔗 Total team assignments created: ${totalAssignmentsCreated}`);
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Run the script
autoAssignGroupSupportTeams()
  .then(() => {
    console.log('\n✅ Script completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
