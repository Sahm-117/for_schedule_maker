// Reconcile Cohort 9 activity labels for schedule go-live.
//
// Purpose: at go-live, ONLY "Inspirational Scriptures" activities should carry a
// label (so only those trigger notifications). Everything else is stripped, to be
// assigned later via the rota feature / manually.
//
// What it does:
//   (1) Sets the resolved Scriptural-Posting rota person's label on that week's
//       "Inspirational Scriptures" activities (replacing any existing label).
//   (2) Removes ALL labels from every non-"Inspirational Scriptures" activity.
//
// Weeks left out of RESOLVED keep whatever they currently have (assign manually).
//
// Usage:
//   node scripts/reconcile-golive-labels.js            # dry run
//   node scripts/reconcile-golive-labels.js --apply    # write
//
// SAFETY: run the dry run first. Consider backing up ActivityLabel beforehand:
//   node scripts/backup-activity-labels.js

const { req, COHORT } = require('./_supabase');

// Scriptural-Posting rota -> Group label (only confidently-resolved weeks).
// Unresolved names (Solomon Temidire, Adetutu Itunuolwa, Kenny Abimbola w/o label,
// Fikayo Omowui, Mary Olalokun) are intentionally omitted — assign those manually.
const RESOLVED = {
  3: 'Group 29 Support', // Oluwatoyin Olotu
  6: 'Group 16 Support', // Olamide Irojah
  8: 'Group 29 Support', // Oluwatoyin Olotu
};

const APPLY = process.argv.includes('--apply');
const isInsp = d => /^Inspirational Scriptures\s*$/i.test((d || '').trim());

async function main() {
  // Fetch all Cohort activities (paginated)
  let acts = [], from = 0;
  for (;;) {
    const page = await req('GET',
      `/rest/v1/Activity?select=id,description,Day!inner(Week!inner(weekNumber,cohortId))` +
      `&Day.Week.cohortId=eq.${COHORT}&order=id&offset=${from}&limit=1000`);
    acts = acts.concat(page);
    if (page.length < 1000) break;
    from += 1000;
  }

  const insp = acts.filter(a => isInsp(a.description));
  const other = acts.filter(a => !isInsp(a.description));
  const otherIds = other.map(a => a.id);

  const inspByWk = {};
  insp.forEach(a => {
    const w = a.Day.Week.weekNumber;
    (inspByWk[w] = inspByWk[w] || []).push(a.id);
  });

  console.log(`Cohort activities: ${acts.length} total | ${insp.length} Inspirational | ${other.length} other`);
  for (const [w, name] of Object.entries(RESOLVED)) {
    console.log(`  Wk${w} Inspirational (${(inspByWk[w] || []).length} rows) -> "${name}"`);
  }
  console.log(`  strip labels from ${otherIds.length} non-Inspirational activities`);

  if (!APPLY) {
    console.log('\n(dry run — pass --apply to write)');
    return;
  }

  // (1) resolved Inspirational labels
  for (const [w, name] of Object.entries(RESOLVED)) {
    const ids = inspByWk[w] || [];
    if (!ids.length) continue;
    const lab = await req('GET', `/rest/v1/Label?name=eq.${encodeURIComponent(name)}&select=id`);
    if (!lab.length) throw new Error('label not found: ' + name);
    await req('DELETE', `/rest/v1/ActivityLabel?activityId=in.(${ids.join(',')})`);
    await req('POST', '/rest/v1/ActivityLabel', ids.map(id => ({ activityId: id, labelId: lab[0].id })));
    console.log(`SET Wk${w}: "${name}" on ${ids.length} activities`);
  }

  // (2) strip labels from all non-Inspirational (chunked)
  for (let i = 0; i < otherIds.length; i += 300) {
    const chunk = otherIds.slice(i, i + 300);
    await req('DELETE', `/rest/v1/ActivityLabel?activityId=in.(${chunk.join(',')})`);
  }
  console.log(`STRIPPED labels from ${otherIds.length} non-Inspirational activities.`);
}

main().catch(e => { console.error('ERR', e.message); process.exit(1); });
