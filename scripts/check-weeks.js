require('dotenv').config({ path: '../.env' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkWeeks() {
  console.log('=== Checking All Weeks ===\n');

  const { data: weeks, error } = await supabase
    .from('Week')
    .select('*')
    .order('weekNumber', { ascending: true });

  if (error) {
    console.error('Error fetching weeks:', error);
    return;
  }

  console.log('Total weeks in database:', weeks.length);
  console.log('\nWeeks:');
  weeks.forEach(week => {
    console.log(`  Week ${week.weekNumber}: ID = ${week.id}, Start = ${week.startDate}, End = ${week.endDate}`);
  });

  // Check for Sunday activities with potential duplicates
  console.log('\n\n=== Checking Sunday Activities Across All Weeks ===');

  for (const week of weeks) {
    const { data: days, error: daysError } = await supabase
      .from('Day')
      .select('*')
      .eq('weekId', week.id)
      .eq('dayName', 'SUNDAY')
      .single();

    if (daysError) {
      console.log(`\nWeek ${week.weekNumber} Sunday: ERROR - ${daysError.message}`);
      continue;
    }

    const { data: activities, error: activitiesError } = await supabase
      .from('Activity')
      .select('*')
      .eq('dayId', days.id)
      .order('time', { ascending: true });

    if (activitiesError) {
      console.log(`\nWeek ${week.weekNumber} Sunday: ERROR fetching activities - ${activitiesError.message}`);
      continue;
    }

    console.log(`\nWeek ${week.weekNumber} Sunday (Day ID: ${days.id}): ${activities.length} activities`);

    // Group by time + description
    const grouped = {};
    activities.forEach(activity => {
      const key = `${activity.time}|${activity.description}`;
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(activity);
    });

    // Show duplicates
    Object.entries(grouped).forEach(([key, acts]) => {
      if (acts.length > 1) {
        const [time, description] = key.split('|');
        console.log(`  ⚠️  DUPLICATE: ${time} - "${description}" (${acts.length} copies)`);
        acts.forEach(a => console.log(`      ID: ${a.id}`));
      }
    });

    // Show 6am and 9pm specifically
    const sixAm = activities.filter(a => a.time === '06:00');
    const ninePm = activities.filter(a => a.time === '21:00');

    if (sixAm.length > 0) {
      console.log(`  6:00 AM: ${sixAm.length} activity(ies)`);
      sixAm.forEach(a => console.log(`    - ID: ${a.id} | "${a.description}"`));
    }

    if (ninePm.length > 0) {
      console.log(`  9:00 PM: ${ninePm.length} activity(ies)`);
      ninePm.forEach(a => console.log(`    - ID: ${a.id} | "${a.description}"`));
    }
  }

  // Check Wednesday activities
  console.log('\n\n=== Checking Wednesday 6am Prayer Posts Across All Weeks ===');

  for (const week of weeks) {
    const { data: days, error: daysError } = await supabase
      .from('Day')
      .select('*')
      .eq('weekId', week.id)
      .eq('dayName', 'WEDNESDAY')
      .single();

    if (daysError) {
      console.log(`\nWeek ${week.weekNumber} Wednesday: ERROR - ${daysError.message}`);
      continue;
    }

    const { data: activities, error: activitiesError } = await supabase
      .from('Activity')
      .select('*')
      .eq('dayId', days.id)
      .eq('time', '06:00')
      .order('description', { ascending: true });

    if (activitiesError) {
      console.log(`\nWeek ${week.weekNumber} Wednesday 6am: ERROR - ${activitiesError.message}`);
      continue;
    }

    if (activities.length > 0) {
      console.log(`\nWeek ${week.weekNumber} Wednesday (Day ID: ${days.id}): ${activities.length} activity(ies) at 6am`);

      // Group by description
      const grouped = {};
      activities.forEach(activity => {
        if (!grouped[activity.description]) {
          grouped[activity.description] = [];
        }
        grouped[activity.description].push(activity);
      });

      Object.entries(grouped).forEach(([description, acts]) => {
        if (acts.length > 1) {
          console.log(`  ⚠️  DUPLICATE: "${description}" (${acts.length} copies)`);
          acts.forEach(a => console.log(`      ID: ${a.id}`));
        } else {
          console.log(`  "${description}" - ID: ${acts[0].id}`);
        }
      });
    }
  }
}

checkWeeks().catch(console.error);
