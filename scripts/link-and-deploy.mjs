// scripts/link-and-deploy.mjs
// Links the local supabase/ project to the cloud project via DB password,
// then deploys the Edge Function. Reads password from .env.local.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8')
  .split(/\r?\n/).filter(Boolean).map((line) => {
    const idx = line.indexOf('=');
    return idx < 0 ? null : [line.slice(0, idx).trim(), line.slice(idx + 1).trim()];
  }).filter(Boolean));

const password = env.SUPABASE_DB_PASSWORD;
const ref = env.SUPABASE_PROJECT_REF;

if (!password || !ref) throw new Error('missing SUPABASE_DB_PASSWORD / SUPABASE_PROJECT_REF');

function run(cmd, args, label) {
  console.log(`\n=== ${label} ===`);
  try {
    execFileSync(cmd, args, { stdio: 'inherit', cwd: ROOT, shell: true });
  } catch (err) {
    console.error(`[${label}] failed:`, err.message);
    throw err;
  }
}

const SUPABASE_BIN = process.env.SUPABASE_BIN || 'supabase';
const supabase = (args, label) => run(SUPABASE_BIN, args, label);

// 1. Link
supabase(['link', '--project-ref', ref, '--password', password], 'link');

// 2. Set Gemini secret (Edge Function env). Skip if GEMINI_API_KEY empty.
const gemini = env.GEMINI_API_KEY?.trim();
if (gemini) {
  supabase(['secrets', 'set', `GEMINI_API_KEY=${gemini}`, '--project-ref', ref], 'secrets set GEMINI_API_KEY');
} else {
  console.log('\n[skip] GEMINI_API_KEY empty in .env.local — set it later via:');
  console.log(`  supabase secrets set GEMINI_API_KEY=<key> --project-ref ${ref}`);
}

// 3. Deploy Edge Function
supabase(['functions', 'deploy', 'evaluate-ai', '--project-ref', ref, '--no-verify-jwt=false'], 'functions deploy evaluate-ai');

console.log('\nDONE.');