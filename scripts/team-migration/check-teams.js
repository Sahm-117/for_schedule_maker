require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function checkTeams() {
  console.log('📋 Fetching all teams from database...\n');

  const { data: teams, error } = await supabase
    .from('Team')
    .select('*')
    .order('name');

  if (error) {
    console.error('❌ Error:', error.message);
    return;
  }

  if (teams.length === 0) {
    console.log('⚠️  No teams found in database');
    return;
  }

  console.log(`✅ Found ${teams.length} teams:\n`);
  teams.forEach((team, index) => {
    console.log(`${index + 1}. "${team.name}" (ID: ${team.id}, Color: ${team.color})`);
  });

  // Check for Group Support pattern
  console.log('\n🔍 Searching for "Group Support" teams...');
  const groupSupportTeams = teams.filter(t => t.name.toLowerCase().includes('group support'));

  if (groupSupportTeams.length === 0) {
    console.log('❌ No "Group Support" teams found');
  } else {
    console.log(`✅ Found ${groupSupportTeams.length} "Group Support" teams:`);
    groupSupportTeams.forEach(team => {
      console.log(`   - ${team.name}`);
    });
  }
}

checkTeams()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
  });
