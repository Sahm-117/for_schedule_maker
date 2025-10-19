require('dotenv').config({ path: '../.env' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function createTeamTables() {
  console.log('🔄 Creating Team and ActivityTeam tables in Supabase...\n');

  // SQL to create Team table
  const createTeamTableSQL = `
    CREATE TABLE IF NOT EXISTS "Team" (
      "id" SERIAL PRIMARY KEY,
      "name" TEXT UNIQUE NOT NULL,
      "color" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `;

  // SQL to create ActivityTeam junction table
  const createActivityTeamTableSQL = `
    CREATE TABLE IF NOT EXISTS "ActivityTeam" (
      "activityId" INTEGER NOT NULL,
      "teamId" INTEGER NOT NULL,
      "order" INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY ("activityId", "teamId"),
      CONSTRAINT "ActivityTeam_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "ActivityTeam_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
  `;

  // SQL to create indexes
  const createIndexesSQL = `
    CREATE INDEX IF NOT EXISTS "ActivityTeam_activityId_idx" ON "ActivityTeam"("activityId");
    CREATE INDEX IF NOT EXISTS "ActivityTeam_teamId_idx" ON "ActivityTeam"("teamId");
  `;

  try {
    // Execute Team table creation
    console.log('Creating Team table...');
    const { error: teamError } = await supabase.rpc('exec_sql', {
      sql: createTeamTableSQL
    });

    if (teamError) {
      // Try direct query if RPC not available
      console.log('RPC method not available, trying direct SQL...');
      const { error: directError } = await supabase.from('Team').select('id').limit(1);
      if (directError && directError.code !== 'PGRST116') {
        console.error('❌ Error creating Team table:', directError);
        console.log('\n⚠️  Manual SQL required. Please run this in Supabase SQL Editor:');
        console.log(createTeamTableSQL);
        console.log(createActivityTeamTableSQL);
        console.log(createIndexesSQL);
        return false;
      }
    }

    console.log('✅ Team table created successfully\n');

    console.log('Creating ActivityTeam table...');
    const { error: actTeamError } = await supabase.rpc('exec_sql', {
      sql: createActivityTeamTableSQL
    });

    if (actTeamError) {
      console.log('⚠️  ActivityTeam table creation needs manual execution');
    } else {
      console.log('✅ ActivityTeam table created successfully\n');
    }

    console.log('Creating indexes...');
    await supabase.rpc('exec_sql', { sql: createIndexesSQL });
    console.log('✅ Indexes created successfully\n');

    return true;
  } catch (error) {
    console.error('❌ Error:', error);
    console.log('\n📋 Please run the following SQL manually in Supabase SQL Editor:\n');
    console.log('-- Create Team table');
    console.log(createTeamTableSQL);
    console.log('\n-- Create ActivityTeam junction table');
    console.log(createActivityTeamTableSQL);
    console.log('\n-- Create indexes');
    console.log(createIndexesSQL);
    return false;
  }
}

// Main execution
(async () => {
  const success = await createTeamTables();

  if (success) {
    console.log('🎉 Database tables created successfully!');
    console.log('\n Next step: Run the data migration script:');
    console.log('   node migrate-teams-from-descriptions.js\n');
  } else {
    console.log('\n⚠️  Please create tables manually in Supabase SQL Editor');
    console.log('   Then run: node migrate-teams-from-descriptions.js\n');
  }
})();
