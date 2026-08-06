#!/usr/bin/env node

// Attach locally available, book-referenced listening tracks to canonical lessons.

import {
  closeSync,
  existsSync,
  fsyncSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { randomUUID } from 'node:crypto';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_LISTENING_PATH = join(PROJECT_ROOT, 'data', 'book', 'listening.json');
export const DEFAULT_AUDIO_ROOT = join(
  PROJECT_ROOT,
  'N2_somatome',
  '53. Somatome N2 Chokai CDs',
);

export const LESSON_TRACK_RANGES = Object.freeze([
  Object.freeze({ id: 'l1d1', disc: 1, first: 2, last: 4 }),
  Object.freeze({ id: 'l1d2', disc: 1, first: 5, last: 6 }),
  Object.freeze({ id: 'l1d3', disc: 1, first: 7, last: 8 }),
  Object.freeze({ id: 'l1d4', disc: 1, first: 9, last: 11 }),
  Object.freeze({ id: 'l1d5', disc: 1, first: 12, last: 17 }),
  Object.freeze({ id: 'l2d1', disc: 1, first: 19, last: 23 }),
  Object.freeze({ id: 'l2d2', disc: 1, first: 24, last: 26 }),
  Object.freeze({ id: 'l2d3', disc: 1, first: 27, last: 30 }),
  Object.freeze({ id: 'l2d4', disc: 1, first: 31, last: 33 }),
  Object.freeze({ id: 'l2d5', disc: 1, first: 34, last: 36 }),
  Object.freeze({ id: 'l2d6', disc: 1, first: 37, last: 38 }),
  Object.freeze({ id: 'l2d7', disc: 1, first: 39, last: 51 }),
  Object.freeze({ id: 'l3d1', disc: 1, first: 53, last: 55 }),
  Object.freeze({ id: 'l3d2', disc: 1, first: 56, last: 58 }),
  Object.freeze({ id: 'l3d3', disc: 1, first: 59, last: 61 }),
  Object.freeze({ id: 'l3d4', disc: 1, first: 62, last: 64 }),
  Object.freeze({ id: 'l3d5', disc: 2, first: 1, last: 8 }),
  Object.freeze({ id: 'l4d1', disc: 2, first: 10, last: 12 }),
  Object.freeze({ id: 'l4d2', disc: 2, first: 13, last: 15 }),
  Object.freeze({ id: 'l4d3', disc: 2, first: 16, last: 18 }),
  Object.freeze({ id: 'l4d4', disc: 2, first: 19, last: 21 }),
  Object.freeze({ id: 'l4d5', disc: 2, first: 22, last: 29 }),
  Object.freeze({ id: 'l5d1', disc: 2, first: 30, last: 52 }),
]);

export const INTRO_TRACK_MAPPINGS = Object.freeze([
  Object.freeze({ lessonId: 'l1d1', disc: 1, track: 1 }),
  Object.freeze({ lessonId: 'l2d1', disc: 1, track: 18 }),
  Object.freeze({ lessonId: 'l3d1', disc: 1, track: 52 }),
  Object.freeze({ lessonId: 'l4d1', disc: 2, track: 9 }),
]);

const EXPECTED_LESSON_IDS = Object.freeze(
  [5, 7, 5, 5, 1].flatMap((lessonCount, chapterIndex) => (
    Array.from({ length: lessonCount }, (_, lessonIndex) => (
      `l${chapterIndex + 1}d${lessonIndex + 1}`
    ))
  )),
);

function trackKey(disc, track) {
  return `${disc}:${track}`;
}

function trackLabel(disc, track) {
  return `CD${disc}-${String(track).padStart(2, '0')}`;
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sortedDirectoryEntries(path) {
  return readdirSync(path, { withFileTypes: true }).sort((left, right) => (
    left.name < right.name ? -1 : left.name > right.name ? 1 : 0
  ));
}

function validateStaticMappings() {
  if (LESSON_TRACK_RANGES.length !== EXPECTED_LESSON_IDS.length) {
    throw new Error(
      `Listening mapping must cover ${EXPECTED_LESSON_IDS.length} lessons; `
      + `received ${LESSON_TRACK_RANGES.length}.`,
    );
  }

  const mappedIds = LESSON_TRACK_RANGES.map(({ id }) => id);
  const missingIds = EXPECTED_LESSON_IDS.filter((id) => !mappedIds.includes(id));
  const unknownIds = mappedIds.filter((id) => !EXPECTED_LESSON_IDS.includes(id));
  const duplicateIds = mappedIds.filter((id, index) => mappedIds.indexOf(id) !== index);
  if (missingIds.length || unknownIds.length || duplicateIds.length) {
    throw new Error(
      'Invalid listening lesson mapping; '
      + `missing=[${missingIds.join(', ')}], unknown=[${unknownIds.join(', ')}], `
      + `duplicates=[${[...new Set(duplicateIds)].join(', ')}].`,
    );
  }

  const coreOwners = new Map();
  for (const range of LESSON_TRACK_RANGES) {
    if (!Number.isInteger(range.disc) || !Number.isInteger(range.first)
      || !Number.isInteger(range.last) || range.first > range.last) {
      throw new Error(`Invalid track range for ${range.id}.`);
    }
    for (let track = range.first; track <= range.last; track += 1) {
      const key = trackKey(range.disc, track);
      if (coreOwners.has(key)) {
        throw new Error(
          `Duplicate core track mapping for ${trackLabel(range.disc, track)}: `
          + `${coreOwners.get(key)} and ${range.id}.`,
        );
      }
      coreOwners.set(key, range.id);
    }
  }

  if (coreOwners.size !== 112) {
    throw new Error(`Printed listening mapping must contain 112 tracks; received ${coreOwners.size}.`);
  }

  const introOwners = new Map();
  for (const intro of INTRO_TRACK_MAPPINGS) {
    if (!EXPECTED_LESSON_IDS.includes(intro.lessonId)) {
      throw new Error(`Unknown intro lesson mapping: ${intro.lessonId}.`);
    }
    const key = trackKey(intro.disc, intro.track);
    if (coreOwners.has(key) || introOwners.has(key)) {
      throw new Error(`Duplicate intro track mapping for ${trackLabel(intro.disc, intro.track)}.`);
    }
    introOwners.set(key, intro.lessonId);
  }

  if (introOwners.size !== 4) {
    throw new Error(`Listening mapping must contain four chapter intros; received ${introOwners.size}.`);
  }

  return { coreOwners, introOwners };
}

const { coreOwners: CORE_TRACK_OWNERS, introOwners: INTRO_TRACK_OWNERS } = validateStaticMappings();

function rootRelativeSource(projectRoot, absolutePath) {
  const pathFromRoot = relative(projectRoot, absolutePath);
  if (!pathFromRoot || isAbsolute(pathFromRoot) || pathFromRoot === '..'
    || pathFromRoot.startsWith(`..${sep}`)) {
    throw new Error(`Audio path is outside the project root: ${absolutePath}.`);
  }
  return pathFromRoot.split(sep).join('/');
}

/** Discover local MP3 files without following symlinks or synthesizing filenames. */
export function discoverLocalMp3s({
  projectRoot = PROJECT_ROOT,
  audioRoot = DEFAULT_AUDIO_ROOT,
} = {}) {
  const resolvedProjectRoot = resolve(projectRoot);
  const resolvedAudioRoot = resolve(audioRoot);
  if (!existsSync(resolvedAudioRoot)) {
    throw new Error(`Listening audio source directory does not exist: ${resolvedAudioRoot}.`);
  }

  const inventory = new Map();

  function visit(directory) {
    for (const entry of sortedDirectoryEntries(directory)) {
      const absolutePath = join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error(`Symlinks are not allowed in the listening audio source: ${absolutePath}.`);
      }
      if (entry.isDirectory()) {
        visit(absolutePath);
        continue;
      }
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.mp3')) continue;

      const pathFromAudioRoot = relative(resolvedAudioRoot, absolutePath);
      const discSegments = pathFromAudioRoot
        .split(sep)
        .map((segment) => /^N2 Somatome CD([12])$/.exec(segment))
        .filter(Boolean);
      const filenameMatch = /^(\d{2})\.mp3$/i.exec(entry.name);
      if (discSegments.length !== 1 || !filenameMatch) {
        throw new Error(`Unknown listening MP3 filename or disc directory: ${absolutePath}.`);
      }

      const disc = Number(discSegments[0][1]);
      const track = Number(filenameMatch[1]);
      const key = trackKey(disc, track);
      const coreLessonId = CORE_TRACK_OWNERS.get(key);
      const introLessonId = INTRO_TRACK_OWNERS.get(key);
      if (!coreLessonId && !introLessonId) {
        throw new Error(`Unknown local MP3 mapping for ${trackLabel(disc, track)}: ${absolutePath}.`);
      }
      if (inventory.has(key)) {
        throw new Error(
          `Duplicate local MP3 mapping for ${trackLabel(disc, track)}: `
          + `${inventory.get(key).absolutePath} and ${absolutePath}.`,
        );
      }

      inventory.set(key, Object.freeze({
        absolutePath,
        disc,
        intro: Boolean(introLessonId),
        label: trackLabel(disc, track),
        lessonId: coreLessonId || introLessonId,
        src: rootRelativeSource(resolvedProjectRoot, absolutePath),
        track,
      }));
    }
  }

  visit(resolvedAudioRoot);
  return inventory;
}

function validateListeningCoverage(listening) {
  if (!isRecord(listening)) {
    throw new Error('data/book/listening.json must contain a JSON object keyed by lesson ID.');
  }
  const actualIds = Object.keys(listening);
  const missingIds = EXPECTED_LESSON_IDS.filter((id) => !Object.hasOwn(listening, id));
  const unknownIds = actualIds.filter((id) => !EXPECTED_LESSON_IDS.includes(id));
  if (actualIds.length !== 23 || missingIds.length || unknownIds.length) {
    throw new Error(
      `Listening JSON must cover exactly 23 lessons; actual=${actualIds.length}, `
      + `missing=[${missingIds.join(', ')}], unknown=[${unknownIds.join(', ')}].`,
    );
  }
  for (const id of EXPECTED_LESSON_IDS) {
    if (!isRecord(listening[id])) throw new Error(`Listening lesson ${id} must be a JSON object.`);
  }
}

export function enrichListeningLessons(listening, inventory) {
  validateListeningCoverage(listening);
  if (!(inventory instanceof Map)) throw new Error('Audio inventory must be a Map.');

  const enriched = {};
  let required = 0;
  let present = 0;
  let introPresent = 0;

  for (const range of LESSON_TRACK_RANGES) {
    const audioTracks = [];
    for (let track = range.first; track <= range.last; track += 1) {
      required += 1;
      const file = inventory.get(trackKey(range.disc, track));
      if (!file) continue;
      if (file.intro || file.lessonId !== range.id) {
        throw new Error(`Inventory mapping conflict for ${file.label} and ${range.id}.`);
      }
      present += 1;
      audioTracks.push({ label: file.label, src: file.src });
    }

    const introTracks = INTRO_TRACK_MAPPINGS
      .filter(({ lessonId }) => lessonId === range.id)
      .map(({ disc, track }) => inventory.get(trackKey(disc, track)))
      .filter(Boolean)
      .map((file) => {
        if (!file.intro || file.lessonId !== range.id) {
          throw new Error(`Inventory intro mapping conflict for ${file.label} and ${range.id}.`);
        }
        introPresent += 1;
        return { label: file.label, src: file.src };
      });

    const lessonRequired = range.last - range.first + 1;
    const lessonPresent = audioTracks.length;
    const lessonMissing = lessonRequired - lessonPresent;
    const status = lessonPresent === lessonRequired
      ? 'complete'
      : lessonPresent > 0 ? 'partial' : 'missing';

    enriched[range.id] = {
      ...listening[range.id],
      audio: audioTracks[0]?.src || '',
      audioTracks,
      introTracks,
      audioCoverage: {
        required: lessonRequired,
        present: lessonPresent,
        missing: lessonMissing,
        status,
      },
    };
  }

  const missing = required - present;
  if (required !== 112) throw new Error(`Aggregate required-track count changed to ${required}.`);
  if (inventory.size !== present + introPresent) {
    throw new Error(
      `Inventory accounting mismatch: discovered=${inventory.size}, `
      + `core=${present}, intros=${introPresent}.`,
    );
  }

  return {
    listening: enriched,
    summary: Object.freeze({
      introPresent,
      localIncludingIntros: inventory.size,
      lessons: LESSON_TRACK_RANGES.length,
      missing,
      present,
      required,
    }),
  };
}

export function writeJsonAtomic(path, value) {
  const temporaryPath = join(
    dirname(path),
    `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`,
  );
  let descriptor;
  try {
    descriptor = openSync(temporaryPath, 'wx');
    writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    renameSync(temporaryPath, path);
  } catch (error) {
    if (descriptor !== undefined) closeSync(descriptor);
    if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
    throw error;
  }
}

function readJson(path) {
  let source;
  try {
    source = readFileSync(path, 'utf8').replace(/^\uFEFF/, '');
  } catch (error) {
    if (!existsSync(path)) {
      throw new Error(`Canonical listening data is missing; run finalization first: ${path}.`);
    }
    throw error;
  }
  return JSON.parse(source);
}

export function run({
  audioRoot,
  dryRun = false,
  inputPath,
  log = console.log,
  projectRoot = PROJECT_ROOT,
} = {}) {
  const resolvedProjectRoot = resolve(projectRoot);
  const resolvedInputPath = resolve(
    inputPath || join(resolvedProjectRoot, 'data', 'book', 'listening.json'),
  );
  const resolvedAudioRoot = resolve(
    audioRoot || join(resolvedProjectRoot, 'N2_somatome', '53. Somatome N2 Chokai CDs'),
  );
  const listening = readJson(resolvedInputPath);
  const inventory = discoverLocalMp3s({
    projectRoot: resolvedProjectRoot,
    audioRoot: resolvedAudioRoot,
  });
  const result = enrichListeningLessons(listening, inventory);

  if (!dryRun) writeJsonAtomic(resolvedInputPath, result.listening);
  const mode = dryRun ? 'Dry run' : 'Updated';
  log(
    `${mode}: 23 lessons; core required/present/missing=`
    + `${result.summary.required}/${result.summary.present}/${result.summary.missing}; `
    + `${result.summary.localIncludingIntros} local MP3s including `
    + `${result.summary.introPresent} intros.`,
  );
  return result;
}

function parseArguments(arguments_) {
  const options = { dryRun: false, help: false };
  for (const argument of arguments_) {
    if (argument === '--dry-run') options.dryRun = true;
    else if (argument === '--help' || argument === '-h') options.help = true;
    else throw new Error(`Unknown argument: ${argument}.`);
  }
  return options;
}

function printHelp() {
  console.log('Usage: node scripts/map-listening-audio.mjs [--dry-run]');
  console.log('  --dry-run  Validate and report mappings without changing listening.json.');
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) printHelp();
    else run({ dryRun: options.dryRun });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
