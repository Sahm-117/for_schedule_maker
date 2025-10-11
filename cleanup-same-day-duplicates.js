const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://vnmeeqvwqaeczjlvzoul.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZubWVlcXZ3cWFlY3pqbHZ6b3VsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTUyMDY3OSwiZXhwIjoyMDc1MDk2Njc5fQ.DTg7BGVfK_oB3pm2TugtWKRgEkkNVeYN1MduxSBCrAM';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function cleanupSameDayDuplicates() {
  console.log('=== Cleaning Up SAME-DAY Duplicate Activities ===\n');
  console.log('NOTE: This will ONLY remove duplicates that occur on the SAME day.');
  console.log('Activities that repeat across different days/weeks are NORMAL and will NOT be touched.\n');

  // Fetch all activities
  const { data: allActivities, error } = await supabase
    .from('Activity')
    .select('*, Day (dayName, Week (weekNumber))')
    .order('dayId', { ascending: true })
    .order('time', { ascending: true })
    .order('id', { ascending: true }); // Keep the one with the lowest ID

  if (error) {
    console.error('Error fetching activities:', error);
    return;
  }

  console.log(`Total activities in database: ${allActivities.length}\n`);

  // Group by dayId + time + description (this ensures we only find same-day duplicates)
  const grouped = {};
  allActivities.forEach(activity => {
    const key = `${activity.dayId}|${activity.time}|${activity.description}`;
    if (!grouped[key]) {
      grouped[key] = [];
    }
    grouped[key].push(activity);
  });

  // Find ONLY same-day duplicates
  const sameDayDuplicates = [];
  Object.entries(grouped).forEach(([key, activities]) => {
    if (activities.length > 1) {
      // These are duplicates on the SAME day
      sameDayDuplicates.push({ key, activities });
    }
  });

  console.log(`Found ${sameDayDuplicates.length} sets of SAME-DAY duplicates\n`);

  if (sameDayDuplicates.length === 0) {
    console.log('✓ No same-day duplicates found!');
    return;
  }

  // Prepare deletion list (keep first, delete the rest)
  const toDelete = [];

  console.log('Same-day duplicates to be removed:\n');
  sameDayDuplicates.forEach(({ key, activities }) => {
    const [dayId, time, description] = key.split('|');
    const weekNum = activities[0].Day?.Week?.weekNumber || 'Unknown';
    const dayName = activities[0].Day?.dayName || 'Unknown';

    console.log(`\nWeek ${weekNum} ${dayName} (Day ID: ${dayId}) - ${time}`);
    console.log(`  Activity: "${description.substring(0, 60)}${description.length > 60 ? '...' : ''}"`);
    console.log(`  Found ${activities.length} copies on this SAME day`);
    console.log(`  ✓ Keeping: ID ${activities[0].id} (lowest ID)`);
    console.log(`  ✗ Deleting: ${activities.slice(1).map(a => `ID ${a.id}`).join(', ')}`);

    // Add all except the first to deletion list
    toDelete.push(...activities.slice(1).map(a => a.id));
  });

  console.log(`\n\n═══════════════════════════════════════════════`);
  console.log(`Total duplicate activities to delete: ${toDelete.length}`);
  console.log(`Activities that will remain: ${allActivities.length - toDelete.length}`);
  console.log(`═══════════════════════════════════════════════`);
  console.log('\n⚠️  IMPORTANT: This will permanently delete these duplicate activities!');
  console.log('⚠️  Cross-day/cross-week repeating activities (like daily 6am prayer) are NOT affected.');
  console.log('\nPress Ctrl+C now to cancel, or the script will proceed in 5 seconds...\n');

  // Wait 5 seconds before proceeding
  await new Promise(resolve => setTimeout(resolve, 5000));

  console.log('Proceeding with deletion...\n');

  // Delete in batches of 50
  let deleted = 0;
  for (let i = 0; i < toDelete.length; i += 50) {
    const batch = toDelete.slice(i, i + 50);

    const { error: deleteError } = await supabase
      .from('Activity')
      .delete()
      .in('id', batch);

    if (deleteError) {
      console.error(`Error deleting batch starting at ${i}:`, deleteError);
    } else {
      deleted += batch.length;
      console.log(`Deleted ${deleted}/${toDelete.length} duplicates...`);
    }
  }

  console.log(`\n✓ Cleanup complete! Deleted ${deleted} duplicate activities.`);
  console.log('\nDatabase summary:');
  console.log(`  Before: ${allActivities.length} activities`);
  console.log(`  After: ${allActivities.length - deleted} activities`);
  console.log(`\nYou can now refresh your application and the duplicates should be gone!`);
}

cleanupSameDayDuplicates().catch(console.error);
