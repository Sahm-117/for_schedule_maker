require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function testQuery() {
  console.log('Testing team data in activities query...\n');

  const { data, error } = await supabase
    .from('Week')
    .select(`
      *,
      Day (
        *,
        Activity (
          *,
          ActivityTeam (
            order,
            Team (*)
          )
        )
      )
    `)
    .eq('weekNumber', 2)
    .single();

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('Week 2 data retrieved successfully');

  // Check Sunday activities
  const sunday = data.Day.find(d => d.dayName === 'Sunday');
  if (sunday && sunday.Activity) {
    console.log(`\nSunday has ${sunday.Activity.length} activities:\n`);
    sunday.Activity.forEach(activity => {
      console.log(`Activity: ${activity.description}`);
      console.log(`  Time: ${activity.time}`);
      if (activity.ActivityTeam && activity.ActivityTeam.length > 0) {
        console.log(`  Teams (${activity.ActivityTeam.length}):`);
        activity.ActivityTeam.forEach(at => {
          console.log(`    - ${at.Team.name} (order: ${at.order})`);
        });
      } else {
        console.log(`  Teams: None`);
      }
      console.log('');
    });
  }
}

testQuery()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
