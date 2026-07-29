// Back up the ActivityLabel table to a timestamped JSON file.
// Run before any destructive label change so you can restore.
//
// Usage:
//   node scripts/backup-activity-labels.js
//   node scripts/backup-activity-labels.js --restore <file.json>   # re-insert saved rows

const fs = require('fs');
const path = require('path');
const { req } = require('./_supabase');

async function backup() {
  const rows = await req('GET', '/rest/v1/ActivityLabel?select=activityId,labelId');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const out = path.join(__dirname, `activitylabel-backup-${stamp}.json`);
  fs.writeFileSync(out, JSON.stringify(rows, null, 2));
  console.log(`Saved ${rows.length} ActivityLabel rows -> ${out}`);
}

async function restore(file) {
  const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
  // merge-duplicates so re-running is safe
  for (let i = 0; i < rows.length; i += 300) {
    const chunk = rows.slice(i, i + 300);
    await req('POST', '/rest/v1/ActivityLabel', chunk);
  }
  console.log(`Restored ${rows.length} ActivityLabel rows from ${file}`);
}

const restoreIdx = process.argv.indexOf('--restore');
if (restoreIdx !== -1) {
  const f = process.argv[restoreIdx + 1];
  if (!f) { console.error('usage: --restore <file.json>'); process.exit(1); }
  restore(f).catch(e => { console.error('ERR', e.message); process.exit(1); });
} else {
  backup().catch(e => { console.error('ERR', e.message); process.exit(1); });
}
