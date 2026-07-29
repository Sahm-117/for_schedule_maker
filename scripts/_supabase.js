// Shared Supabase REST helper for maintenance scripts.
// Reads credentials from env — NEVER hardcode the service-role key.
//
// Required env (set in the repo root .env.local, which is gitignored):
//   SUPABASE_URL                 e.g. https://xxxx.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY    the service_role JWT (bypasses RLS)
//
// It will also fall back to the frontend var names if present:
//   VITE_SUPABASE_URL
//
// Cohort 9 id is the default target; override with COHORT_ID env if needed.

const https = require('https');
const fs = require('fs');
const path = require('path');

function loadEnv() {
  // Merge repo-root .env.local then frontend/.env.local (root wins)
  const files = [
    path.join(__dirname, '..', '.env.local'),
    path.join(__dirname, '..', 'frontend', '.env.local'),
  ];
  const env = { ...process.env };
  for (const f of files) {
    try {
      fs.readFileSync(f, 'utf8').split('\n').forEach(line => {
        const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (m && env[m[1]] === undefined) env[m[1]] = m[2].trim();
      });
    } catch { /* file may not exist */ }
  }
  return env;
}

const env = loadEnv();
const BASE = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const COHORT = env.COHORT_ID || 'c894e68a-86c4-47cc-8f53-8d9368244c28'; // Cohort 9

if (!BASE || !KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Add them to .env.local (gitignored).');
  process.exit(1);
}

function req(method, apiPath, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const u = new URL(BASE + apiPath);
    const r = https.request(u, {
      method,
      headers: {
        apikey: KEY,
        Authorization: 'Bearer ' + KEY,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Prefer: 'return=representation',
      },
    }, res => {
      let buf = '';
      res.on('data', c => (buf += c));
      res.on('end', () => (res.statusCode >= 400
        ? reject(new Error(res.statusCode + ' ' + buf))
        : resolve(buf ? JSON.parse(buf) : null)));
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

module.exports = { req, COHORT, BASE };
