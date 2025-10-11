const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://vnmeeqvwqaeczjlvzoul.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZubWVlcXZ3cWFlY3pqbHZ6b3VsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTUyMDY3OSwiZXhwIjoyMDc1MDk2Njc5fQ.DTg7BGVfK_oB3pm2TugtWKRgEkkNVeYN1MduxSBCrAM';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function findDuplicates() {
  console.log('=== Checking Week 3 Sunday (Day ID 15) ===\n');

  const { data: week3SundayActivities, error: error1 } = await supabase
    .from('Activity')
    .select('*')
    .eq('dayId', 15)
    .order('time', { ascending: true })
    .order('orderIndex', { ascending: true });

  if (error1) {
    console.error('Error:', error1);
  } else {
    console.log(`Total activities: ${week3SundayActivities.length}\n`);

    // Group by time + description
    const grouped = {};
    week3SundayActivities.forEach(activity => {
      const key = `${activity.time}|${activity.description}`;
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(activity);
    });

    console.log('All activities:');
    Object.entries(grouped).forEach(([key, activities]) => {
      const [time, description] = key.split('|');
      if (activities.length > 1) {
        console.log(`\n⚠️  DUPLICATE: ${time} - "${description}"`);
        console.log(`   ${activities.length} copies found:`);
        activities.forEach(a => {
          console.log(`   - ID: ${a.id} | Period: ${a.period} | OrderIndex: ${a.orderIndex}`);
        });
      } else {
        const a = activities[0];
        console.log(`\n${time} - "${description}"`);
        console.log(`   ID: ${a.id} | Period: ${a.period} | OrderIndex: ${a.orderIndex}`);
      }
    });

    // Specifically check 6am and 9pm
    const sixAm = week3SundayActivities.filter(a => a.time === '06:00');
    const ninePm = week3SundayActivities.filter(a => a.time === '21:00');

    console.log('\n\n6:00 AM activities:');
    if (sixAm.length === 0) {
      console.log('  None found (may have been deleted)');
    } else {
      sixAm.forEach(a => {
        console.log(`  - ID: ${a.id} | Description: "${a.description}" | Period: ${a.period}`);
      });
    }

    console.log('\n9:00 PM activities:');
    if (ninePm.length === 0) {
      console.log('  None found (may have been deleted)');
    } else {
      ninePm.forEach(a => {
        console.log(`  - ID: ${a.id} | Description: "${a.description}" | Period: ${a.period}`);
      });
    }
  }

  console.log('\n\n=== Checking Week 4 Wednesday (Day ID 25) ===\n');

  const { data: week4WedActivities, error: error2 } = await supabase
    .from('Activity')
    .select('*')
    .eq('dayId', 25)
    .order('time', { ascending: true })
    .order('orderIndex', { ascending: true });

  if (error2) {
    console.error('Error:', error2);
  } else {
    console.log(`Total activities: ${week4WedActivities.length}\n`);

    // Group by time + description
    const grouped = {};
    week4WedActivities.forEach(activity => {
      const key = `${activity.time}|${activity.description}`;
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(activity);
    });

    console.log('All activities:');
    Object.entries(grouped).forEach(([key, activities]) => {
      const [time, description] = key.split('|');
      if (activities.length > 1) {
        console.log(`\n⚠️  DUPLICATE: ${time} - "${description}"`);
        console.log(`   ${activities.length} copies found:`);
        activities.forEach(a => {
          console.log(`   - ID: ${a.id} | Period: ${a.period} | OrderIndex: ${a.orderIndex}`);
        });
      } else {
        const a = activities[0];
        console.log(`\n${time} - "${description}"`);
        console.log(`   ID: ${a.id} | Period: ${a.period} | OrderIndex: ${a.orderIndex}`);
      }
    });

    // Specifically check 6am
    const sixAm = week4WedActivities.filter(a => a.time === '06:00');

    console.log('\n\n6:00 AM activities:');
    if (sixAm.length === 0) {
      console.log('  None found (may have been deleted)');
    } else {
      sixAm.forEach(a => {
        console.log(`  - ID: ${a.id} | Description: "${a.description}" | Period: ${a.period}`);
      });
    }
  }

  // Check for any duplicates across the entire database
  console.log('\n\n=== Scanning Entire Database for Same-Day Duplicates ===\n');

  const { data: allActivities, error: error3 } = await supabase
    .from('Activity')
    .select('*, Day (dayName, Week (weekNumber))')
    .order('dayId', { ascending: true })
    .order('time', { ascending: true });

  if (error3) {
    console.error('Error:', error3);
  } else {
    // Group by dayId + time + description
    const grouped = {};
    allActivities.forEach(activity => {
      const key = `${activity.dayId}|${activity.time}|${activity.description}`;
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(activity);
    });

    let foundDuplicates = false;
    Object.entries(grouped).forEach(([key, activities]) => {
      if (activities.length > 1) {
        foundDuplicates = true;
        const [dayId, time, description] = key.split('|');
        const weekNum = activities[0].Day?.Week?.weekNumber || 'Unknown';
        const dayName = activities[0].Day?.dayName || 'Unknown';

        console.log(`\n⚠️  Week ${weekNum} ${dayName} - ${time} - "${description}"`);
        console.log(`   ${activities.length} duplicate copies:`);
        activities.forEach(a => {
          console.log(`   - ID: ${a.id} | Period: ${a.period} | OrderIndex: ${a.orderIndex}`);
        });
      }
    });

    if (!foundDuplicates) {
      console.log('✓ No duplicates found in the database!');
      console.log('  The issue may have been resolved by your deletion, or');
      console.log('  the duplicates were only appearing in the frontend.');
    }
  }
}

findDuplicates().catch(console.error);
