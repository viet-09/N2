// scripts/apply-schema.mjs
// One-shot SQL apply via Node pg. Reads password from .env.local (gitignored).
// Run: node scripts/apply-schema.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const envPath = path.join(ROOT, '.env.local');
if (!fs.existsSync(envPath)) {
  console.error('Missing .env.local');
  process.exit(1);
}

const env = {};
for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const idx = trimmed.indexOf('=');
  if (idx < 0) continue;
  const k = trimmed.slice(0, idx).trim();
  const v = trimmed.slice(idx + 1).trim();
  env[k] = v;
}

const password = env.SUPABASE_DB_PASSWORD;
const ref = env.SUPABASE_PROJECT_REF;
if (!password || !ref) {
  console.error('.env.local missing SUPABASE_DB_PASSWORD or SUPABASE_PROJECT_REF');
  process.exit(1);
}

const sql = fs.readFileSync(path.join(ROOT, 'supabase', 'schema.sql'), 'utf8');
const client = new pg.Client({
  host: `db.${ref}.supabase.co`,
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password,
  ssl: { rejectUnauthorized: false },
});

console.log(`Connecting to db.${ref}.supabase.co ...`);
try {
  await client.connect();
  console.log('Connected. Applying schema...');
  await client.query(sql);
  console.log('OK — schema applied.');
} catch (err) {
  console.error('FAILED:', err.message);
  process.exit(2);
} finally {
  await client.end();
}