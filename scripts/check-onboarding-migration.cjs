// Usage: PG_PATH=<path to pg> node scripts/check-onboarding-migration.cjs
// Dry run of 20260930250000_onboarding_participant_led.sql against the hosted DB:
// BEGIN, run the migration, call every new/recreated read function, report, and ROLLBACK
// (always). Nothing is saved.
const fs = require('fs');
const path = require('path');
const { Client } = require(process.env.PG_PATH || 'pg');

const env = Object.fromEntries(
  fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }),
);
const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const ref = url.replace(/^https:\/\/([^.]+)\..*$/, '$1');
const file = path.join(__dirname, '../supabase/migrations/20260930250000_onboarding_participant_led.sql');

const client = new Client({
  connectionString: `postgresql://postgres.${ref}:${encodeURIComponent(env.SUPABASE_DB_PASSWORD)}@aws-1-eu-west-2.pooler.supabase.com:5432/postgres`,
  ssl: { rejectUnauthorized: false },
});

const results = { migration: 'not run', state: { ok: 0, fail: 0 }, groups: { ok: 0, fail: 0 }, cohorts: { ok: 0, fail: 0 }, feeds: { ok: 0, fail: 0 } };
const errors = [];

// Each check runs in a savepoint so one failure doesn't abort the rest.
async function attempt(bucket, label, sql, params) {
  await client.query('SAVEPOINT s');
  try {
    const r = await client.query(sql, params);
    await client.query('RELEASE SAVEPOINT s');
    bucket.ok += 1;
    return r;
  } catch (e) {
    await client.query('ROLLBACK TO SAVEPOINT s');
    bucket.fail += 1;
    errors.push(`${label}: ${e.message}`);
    return null;
  }
}

(async () => {
  await client.connect();
  await client.query('BEGIN');
  try {
    await client.query(fs.readFileSync(file, 'utf8'));
    results.migration = 'ok';

    const people = await client.query(`SELECT p.id FROM "Participant" p JOIN "ParticipantAccount" a ON a."participantId" = p.id`);
    for (const p of people.rows) {
      await attempt(results.state, `state ${p.id}`, 'SELECT public.participant_onboarding_state($1::uuid) AS s', [p.id]);
    }
    const sample = await client.query(`SELECT public.participant_onboarding_state(p.id) AS s FROM "Participant" p JOIN "ParticipantAccount" a ON a."participantId" = p.id LIMIT 3`);

    // The progress and feed RPCs check who is calling (staff session), so run them as
    // the internal helpers / builders that they wrap.
    const groups = await client.query(`SELECT id, "cohortId" FROM "Group" WHERE "archivedAt" IS NULL`);
    for (const g of groups.rows) {
      await attempt(results.groups, `group progress ${g.id}`, 'SELECT public.onboarding_progress_json($1::uuid, $2::uuid) AS j', [g.cohortId, g.id]);
    }
    const cohorts = await client.query(`SELECT id FROM "Cohort"`);
    for (const c of cohorts.rows) {
      await attempt(results.cohorts, `cohort progress ${c.id}`, 'SELECT public.onboarding_progress_json($1::uuid, NULL) AS j', [c.id]);
    }
    for (const g of groups.rows.slice(0, 3)) {
      const r = await attempt(results.feeds, `feed ${g.id}`, `SELECT public.build_discussion_feed($1::uuid, 'ADMIN', NULL, NULL, NULL, 10) AS f`, [g.id]);
      if (r && r.rows[0].f.posts.some((p) => !('kind' in p))) errors.push(`feed ${g.id}: a post is missing "kind"`);
    }
    const firstParticipant = await client.query(`SELECT p.id FROM "Participant" p JOIN "ParticipantAccount" a ON a."participantId" = p.id LIMIT 1`);
    if (firstParticipant.rows[0]) {
      await attempt(results.feeds, 'participant feed shape', `SELECT public.build_discussion_feed(public.discussion_participant_group($1::uuid), 'PARTICIPANT', NULL, $1::uuid, NULL, 10) AS f`, [firstParticipant.rows[0].id]);
    }
    console.log('Sample states:', JSON.stringify(sample.rows.map((r) => r.s)));
  } catch (e) {
    results.migration = `FAILED: ${e.message}`;
  } finally {
    await client.query('ROLLBACK');
    await client.end();
  }
  console.log('\nSummary (everything rolled back):');
  console.log(JSON.stringify(results, null, 2));
  if (errors.length) { console.log('\nErrors:'); errors.slice(0, 20).forEach((e) => console.log(' -', e)); }
  process.exit(results.migration === 'ok' && !errors.length ? 0 : 1);
})().catch((e) => { console.error(e.message); process.exit(1); });
