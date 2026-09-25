// Usage: node scripts/apply-migration.cjs supabase/migrations/<file>.sql
// Applies one migration file to the hosted Supabase DB using .env.local credentials.
const fs = require('fs');
const path = require('path');
// pg isn't a project dependency; pass its folder via PG_PATH if not resolvable.
const { Client } = require(process.env.PG_PATH || 'pg');

const env = Object.fromEntries(
  fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }),
);
const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const ref = url.replace(/^https:\/\/([^.]+)\..*$/, '$1');
const file = process.argv[2];
if (!file) { console.error('Pass a migration file path'); process.exit(1); }

const client = new Client({
  connectionString: `postgresql://postgres.${ref}:${encodeURIComponent(env.SUPABASE_DB_PASSWORD)}@aws-1-eu-west-2.pooler.supabase.com:5432/postgres`,
  ssl: { rejectUnauthorized: false },
});

(async () => {
  await client.connect();
  await client.query(fs.readFileSync(file, 'utf8'));
  console.log('Applied', file);
  await client.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
