const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://vnmeeqvwqaeczjlvzoul.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZubWVlcXZ3cWFlY3pqbHZ6b3VsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTUyMDY3OSwiZXhwIjoyMDc1MDk2Njc5fQ.DTg7BGVfK_oB3pm2TugtWKRgEkkNVeYN1MduxSBCrAM';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function cleanupDuplicates() {
  console.log('=== Starting Duplicate Cleanup ===\n');

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

  // Group by dayId + time + description
  const grouped = {};
  allActivities.forEach(activity => {
    const key = `${activity.dayId}|${activity.time}|${activity.description}`;
    if (!grouped[key]) {
      grouped[key] = [];
    }
    grouped[key].push(activity);
  });

  // Find duplicates
  const duplicateSets = [];
  Object.entries(grouped).forEach(([key, activities]) => {
    if (activities.length > 1) {
      duplicateSets.push({ key, activities });
    }
  });

  console.log(`Found ${duplicateSets.length} sets of duplicates\n`);

  if (duplicateSets.length === 0) {
    console.log('No duplicates to clean up!');
    return;
  }

  // Prepare deletion list (keep first, delete the rest)
  const toDelete = [];

  console.log('Duplicates to be removed:\n');
  duplicateSets.forEach(({ key, activities }) => {
    const [dayId, time, description] = key.split('|');
    const weekNum = activities[0].Day?.Week?.weekNumber || 'Unknown';
    const dayName = activities[0].Day?.dayName || 'Unknown';

    console.log(`Week ${weekNum} ${dayName} - ${time} - "${description.substring(0, 40)}..."`);
    console.log(`  Keeping: ID ${activities[0].id}`);
    console.log(`  Deleting: ${activities.slice(1).map(a => `ID ${a.id}`).join(', ')}`);

    // Add all except the first to deletion list
    toDelete.push(...activities.slice(1).map(a => a.id));
  });

  console.log(`\n\nTotal activities to delete: ${toDelete.length}`);
  console.log('\n⚠️  IMPORTANT: This will permanently delete these duplicate activities!');
  console.log('Press Ctrl+C now to cancel, or the script will proceed in 5 seconds...\n');

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
  console.log('\nRemaining activities:');
  console.log(`  Before: ${allActivities.length}`);
  console.log(`  After: ${allActivities.length - deleted}`);
}

cleanupDuplicates().catch(console.error);
