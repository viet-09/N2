// scripts/sanitize-book-data.mjs
// Strip Korean Hangul + Chinese side-by-side translation notes that were
// injected into book data by Gemini fill-missing. Does NOT touch kanji /
// hiragana / katakana / Latin / Vietnamese. Idempotent.
//
// Usage: node scripts/sanitize-book-data.mjs [--dry-run]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data', 'book');

const KOREAN = /[ᄀ-ᇿ㄰-㆏가-힯]/g;
const NOTE_FIELDS_TO_DROP = new Set(['note']);

const NOTE_FIELDS = new Set(['note', 'connection', 'formation', 'translation', 'meaningVi', 'descriptionVi']);
// Fields that ARE Japanese content — never strip CJK Han from these.
const JA_FIELDS = new Set([
  'char', 'kanji', 'jp', 'q', 'prompt', 'on', 'kun', 'reading',
  'word', 'wordJp', 'pattern', 'form', 'example', 'heading', 'title',
  'titleEn', 'intro', 'pre', 'post', 'text', 'sub', 'answer',
  'formationPattern', 'formationExample', 'subPrompt',
]);

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run');

function sanitizeString(value, key) {
  let s = String(value);
  const removed = { ko: 0, dropped: false };

  // Drop entire Vietnamese paraphrase notes — Gemini fill produced noise.
  if (NOTE_FIELDS_TO_DROP.has(key)) {
    return { value: '', removed: { ko: 0, dropped: true } };
  }

  // Strip Korean Hangul anywhere — never legitimate Japanese content.
  const koMatches = s.match(KOREAN);
  if (koMatches) {
    removed.ko = koMatches.length;
    s = s.replace(KOREAN, '');
  }

  return { value: s, removed };
}

function walk(node, key, stats) {
  if (node == null) return node;
  if (typeof node === 'string') {
    const { value, removed } = sanitizeString(node, key);
    if (removed.ko) stats.ko += removed.ko;
    if (removed.cjk) stats.cjk += removed.cjk;
    if (removed.ko || removed.cjk) stats.touched++;
    return value;
  }
  if (Array.isArray(node)) {
    return node.map((item) => walk(item, key, stats));
  }
  if (typeof node === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(node)) {
      out[k] = walk(v, k, stats);
    }
    return out;
  }
  return node;
}

const targets = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith('.json') && !f.includes('.classification.') && !f.includes('.images.') && f !== 'manifest.json');

let grandStats = { ko: 0, cjk: 0, touched: 0 };

for (const file of targets) {
  const full = path.join(DATA_DIR, file);
  const raw = fs.readFileSync(full, 'utf8');
  const data = JSON.parse(raw);
  const stats = { ko: 0, cjk: 0, touched: 0 };
  const cleaned = walk(data, '', stats);
  grandStats.ko += stats.ko;
  grandStats.cjk += stats.cjk;
  grandStats.touched += stats.touched;
  console.log(`${file.padEnd(28)} ko=${String(stats.ko).padStart(5)}  cjk=${String(stats.cjk).padStart(5)}  touched=${stats.touched}`);
  if (!DRY_RUN && (stats.ko || stats.cjk)) {
    fs.writeFileSync(full, JSON.stringify(cleaned, null, 2) + '\n', 'utf8');
  }
}

console.log('---');
console.log(`Total: ko=${grandStats.ko}  cjk=${grandStats.cjk}  touched-fields=${grandStats.touched}`);
if (DRY_RUN) console.log('(dry-run; no files written)');