const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://vnmeeqvwqaeczjlvzoul.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZubWVlcXZ3cWFlY3pqbHZ6b3VsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTUyMDY3OSwiZXhwIjoyMDc1MDk2Njc5fQ.DTg7BGVfK_oB3pm2TugtWKRgEkkNVeYN1MduxSBCrAM';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkDays() {
  console.log('=== Checking Day Table ===\n');

  const { data: days, error } = await supabase
    .from('Day')
    .select('*, Week (weekNumber)')
    .order('weekId', { ascending: true })
    .order('dayName', { ascending: true });

  if (error) {
    console.error('Error fetching days:', error);
    return;
  }

  console.log(`Total days in database: ${days.length}\n`);

  if (days.length === 0) {
    console.log('⚠️  NO DAYS FOUND IN DATABASE!\n');
    console.log('This explains why all activities were showing duplicates.');
    console.log('The system likely has multiple Activity records pointing to non-existent dayId values.\n');
  } else {
    // Group by week
    const byWeek = {};
    days.forEach(day => {
      const weekNum = day.Week?.weekNumber || 'Unknown';
      if (!byWeek[weekNum]) {
        byWeek[weekNum] = [];
      }
      byWeek[weekNum].push(day);
    });

    console.log('Days by week:');
    Object.entries(byWeek).forEach(([weekNum, dayList]) => {
      console.log(`\nWeek ${weekNum}:`);
      dayList.forEach(day => {
        console.log(`  ${day.dayName}: ID = ${day.id}`);
      });
    });
  }

  // Check activities without valid Day references
  console.log('\n\n=== Checking Activities ===');

  const { data: activities, error: activitiesError } = await supabase
    .from('Activity')
    .select('id, time, description, dayId, period')
    .order('dayId', { ascending: true })
    .limit(50);

  if (activitiesError) {
    console.error('Error fetching activities:', activitiesError);
    return;
  }

  console.log(`Total activities (first 50): ${activities.length}\n`);

  // Group by dayId
  const byDayId = {};
  activities.forEach(activity => {
    if (!byDayId[activity.dayId]) {
      byDayId[activity.dayId] = [];
    }
    byDayId[activity.dayId].push(activity);
  });

  console.log('Activities grouped by dayId:');
  Object.entries(byDayId).forEach(([dayId, actList]) => {
    console.log(`\nDay ID ${dayId}: ${actList.length} activities`);

    // Check if this day exists
    const dayExists = days.some(d => d.id === parseInt(dayId));
    if (!dayExists) {
      console.log(`  ⚠️  WARNING: Day ID ${dayId} does not exist in Day table!`);
    }

    // Show first 3 activities
    actList.slice(0, 3).forEach(a => {
      console.log(`  - ${a.time}: ${a.description.substring(0, 50)}...`);
    });

    if (actList.length > 3) {
      console.log(`  ... and ${actList.length - 3} more`);
    }
  });

  // Count all activities
  const { count, error: countError } = await supabase
    .from('Activity')
    .select('*', { count: 'exact', head: true });

  if (!countError) {
    console.log(`\n\nTotal activities in database: ${count}`);
  }
}

checkDays().catch(console.error);
