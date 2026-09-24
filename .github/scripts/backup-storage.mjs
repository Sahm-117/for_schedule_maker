// Downloads every file from every Supabase Storage bucket into ./backup/storage/<bucket>/<path>.
// Used by .github/workflows/db-backup.yml. Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');

const headers = { Authorization: `Bearer ${key}`, apikey: key };
const outRoot = join('backup', 'storage');

async function api(path, init = {}) {
  const res = await fetch(`${url}/storage/v1${path}`, { ...init, headers: { ...headers, ...init.headers } });
  if (!res.ok) throw new Error(`${init.method || 'GET'} ${path} -> ${res.status} ${await res.text()}`);
  return res;
}

async function listFolder(bucket, prefix) {
  const items = [];
  for (let offset = 0; ; offset += 1000) {
    const res = await api(`/object/list/${bucket}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix, limit: 1000, offset }),
    });
    const page = await res.json();
    items.push(...page);
    if (page.length < 1000) return items;
  }
}

async function backupFolder(bucket, prefix) {
  let count = 0;
  for (const item of await listFolder(bucket, prefix)) {
    const path = prefix ? `${prefix}/${item.name}` : item.name;
    if (!item.id) {
      count += await backupFolder(bucket, path); // folder
      continue;
    }
    const res = await api(`/object/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`);
    const file = join(outRoot, bucket, path);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, Buffer.from(await res.arrayBuffer()));
    count += 1;
  }
  return count;
}

const buckets = await (await api('/bucket')).json();
await mkdir(outRoot, { recursive: true });
await writeFile(join(outRoot, 'buckets.json'), JSON.stringify(buckets, null, 2));
for (const bucket of buckets) {
  console.log(`${bucket.name}: ${await backupFolder(bucket.name, '')} files`);
}
