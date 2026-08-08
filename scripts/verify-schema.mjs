// scripts/verify-schema.mjs — sanity check after apply-schema.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8')
  .split(/\r?\n/).filter(Boolean).map((line) => {
    const idx = line.indexOf('=');
    return idx < 0 ? null : [line.slice(0, idx).trim(), line.slice(idx + 1).trim()];
  }).filter(Boolean));

const client = new pg.Client({
  host: `db.${env.SUPABASE_PROJECT_REF}.supabase.co`,
  port: 5432, database: 'postgres', user: 'postgres',
  password: env.SUPABASE_DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
const tables = await client.query(`
  select table_name from information_schema.tables
  where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name;
`);
console.log('TABLES:', tables.rows.map((r) => r.table_name).join(', '));
const views = await client.query(`
  select table_name from information_schema.views where table_schema = 'public' order by table_name;
`);
console.log('VIEWS:', views.rows.map((r) => r.table_name).join(', '));
const fns = await client.query(`
  select routine_name from information_schema.routines
  where routine_schema = 'public' order by routine_name;
`);
console.log('FUNCTIONS:', fns.rows.map((r) => r.routine_name).join(', '));
const rlsCount = await client.query(`
  select count(*)::int as n from pg_tables where schemaname = 'public' and rowsecurity = true;
`);
console.log('RLS-ENABLED TABLES:', rlsCount.rows[0].n);
const polCount = await client.query(`
  select count(*)::int as n from pg_policies where schemaname = 'public';
`);
console.log('POLICIES:', polCount.rows[0].n);
await client.end();