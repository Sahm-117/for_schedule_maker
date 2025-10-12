require('dotenv').config({ path: '../.env' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function investigateDuplicates() {
  console.log('=== Investigating Duplicate Activities ===\n');

  // Get Week 3
  const { data: week3, error: week3Error } = await supabase
    .from('Week')
    .select('*')
    .eq('weekNumber', 3)
    .single();

  if (week3Error) {
    console.error('Error fetching Week 3:', week3Error);
    return;
  }

  console.log('Week 3 ID:', week3.id);

  // Get Week 3 Sunday
  const { data: week3Sunday, error: sundayError } = await supabase
    .from('Day')
    .select('*')
    .eq('weekId', week3.id)
    .eq('dayName', 'SUNDAY')
    .single();

  if (sundayError) {
    console.error('Error fetching Week 3 Sunday:', sundayError);
  } else {
    console.log('\n=== Week 3 Sunday ===');
    console.log('Day ID:', week3Sunday.id);

    // Get all activities for Week 3 Sunday
    const { data: sundayActivities, error: activitiesError } = await supabase
      .from('Activity')
      .select('*')
      .eq('dayId', week3Sunday.id)
      .order('time', { ascending: true });

    if (activitiesError) {
      console.error('Error fetching Sunday activities:', activitiesError);
    } else {
      console.log('\nTotal activities:', sundayActivities.length);

      // Group by time to find duplicates
      const groupedByTime = {};
      sundayActivities.forEach(activity => {
        if (!groupedByTime[activity.time]) {
          groupedByTime[activity.time] = [];
        }
        groupedByTime[activity.time].push(activity);
      });

      console.log('\nActivities grouped by time:');
      Object.entries(groupedByTime).forEach(([time, activities]) => {
        console.log(`\n${time}: ${activities.length} activity(ies)`);
        activities.forEach(activity => {
          console.log(`  - ID: ${activity.id} | Description: ${activity.description} | Period: ${activity.period} | OrderIndex: ${activity.orderIndex}`);
        });
      });

      // Highlight duplicates
      console.log('\n=== Duplicates Found ===');
      Object.entries(groupedByTime).forEach(([time, activities]) => {
        if (activities.length > 1) {
          console.log(`\n⚠️  ${time} has ${activities.length} duplicate activities:`);
          activities.forEach(activity => {
            console.log(`  - ID: ${activity.id} | Description: "${activity.description}"`);
          });
        }
      });
    }
  }

  // Get Week 4
  const { data: week4, error: week4Error } = await supabase
    .from('Week')
    .select('*')
    .eq('weekNumber', 4)
    .single();

  if (week4Error) {
    console.error('\nError fetching Week 4:', week4Error);
    return;
  }

  console.log('\n\n=== Week 4 Wednesday ===');
  console.log('Week 4 ID:', week4.id);

  // Get Week 4 Wednesday
  const { data: week4Wednesday, error: wednesdayError } = await supabase
    .from('Day')
    .select('*')
    .eq('weekId', week4.id)
    .eq('dayName', 'WEDNESDAY')
    .single();

  if (wednesdayError) {
    console.error('Error fetching Week 4 Wednesday:', wednesdayError);
  } else {
    console.log('Day ID:', week4Wednesday.id);

    // Get all activities for Week 4 Wednesday
    const { data: wednesdayActivities, error: activitiesError } = await supabase
      .from('Activity')
      .select('*')
      .eq('dayId', week4Wednesday.id)
      .order('time', { ascending: true });

    if (activitiesError) {
      console.error('Error fetching Wednesday activities:', activitiesError);
    } else {
      console.log('\nTotal activities:', wednesdayActivities.length);

      // Group by time to find duplicates
      const groupedByTime = {};
      wednesdayActivities.forEach(activity => {
        if (!groupedByTime[activity.time]) {
          groupedByTime[activity.time] = [];
        }
        groupedByTime[activity.time].push(activity);
      });

      console.log('\nActivities grouped by time:');
      Object.entries(groupedByTime).forEach(([time, activities]) => {
        console.log(`\n${time}: ${activities.length} activity(ies)`);
        activities.forEach(activity => {
          console.log(`  - ID: ${activity.id} | Description: ${activity.description} | Period: ${activity.period} | OrderIndex: ${activity.orderIndex}`);
        });
      });

      // Highlight duplicates
      console.log('\n=== Duplicates Found ===');
      Object.entries(groupedByTime).forEach(([time, activities]) => {
        if (activities.length > 1) {
          console.log(`\n⚠️  ${time} has ${activities.length} duplicate activities:`);
          activities.forEach(activity => {
            console.log(`  - ID: ${activity.id} | Description: "${activity.description}"`);
          });
        }
      });

      // Check for 6am prayer post specifically
      const sixAmActivities = wednesdayActivities.filter(a => a.time === '06:00' && a.description.toLowerCase().includes('prayer'));
      if (sixAmActivities.length > 1) {
        console.log('\n⚠️  Found duplicate 6am prayer post:');
        sixAmActivities.forEach(activity => {
          console.log(`  - ID: ${activity.id} | Description: "${activity.description}"`);
        });
      }
    }
  }

  // Check for any activities with same time + description + dayName across all weeks
  console.log('\n\n=== Checking for Cross-Week Duplicates ===');
  const { data: allActivities, error: allError } = await supabase
    .from('Activity')
    .select('*, Day (dayName, weekId, Week (weekNumber))')
    .order('time', { ascending: true });

  if (allError) {
    console.error('Error fetching all activities:', allError);
  } else {
    const groupKey = (activity) => `${activity.time}|${activity.description}|${activity.Day.dayName}`;
    const grouped = {};

    allActivities.forEach(activity => {
      const key = groupKey(activity);
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(activity);
    });

    console.log('\nActivities that appear in multiple weeks:');
    let foundCrossWeekDuplicates = false;
    Object.entries(grouped).forEach(([key, activities]) => {
      if (activities.length > 1) {
        foundCrossWeekDuplicates = true;
        const [time, description, dayName] = key.split('|');
        const weeks = activities.map(a => a.Day.Week.weekNumber).join(', ');
        console.log(`\n"${description}" at ${time} on ${dayName}:`);
        console.log(`  Exists in weeks: ${weeks}`);
        console.log(`  Activity IDs: ${activities.map(a => a.id).join(', ')}`);
      }
    });

    if (!foundCrossWeekDuplicates) {
      console.log('  No cross-week duplicates found (this is expected)');
    }
  }
}

investigateDuplicates().catch(console.error);
