// js/store.js
// Thin localStorage wrapper + in-memory lessons cache.
// Every read is defensive: malformed/missing/blocked storage falls back to a safe default.

import { STORAGE, DEFAULT_SETTINGS } from './config.js';

// ---------------------------------------------------------------------------
// Generic localStorage helpers (never throw)
// ---------------------------------------------------------------------------

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    const parsed = JSON.parse(raw);
    return parsed == null ? fallback : parsed;
  } catch (err) {
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    // Storage unavailable/full/blocked (e.g. private mode) — silently ignore.
  }
}

function todayStr() {
  try {
    return new Date().toISOString().slice(0, 10);
  } catch (err) {
    return '';
  }
}

// ---------------------------------------------------------------------------
// Lessons (in-memory, set once at boot from data/lessons.json)
// ---------------------------------------------------------------------------

let _lessons = null;

export function setLessons(data) {
  _lessons = data && typeof data === 'object' ? data : null;
}

export function getLessons() {
  return _lessons;
}

/**
 * Search every category/week for a lesson id.
 * @returns {{lesson:object, category:object, week:number}|null}
 */
export function findLesson(id) {
  try {
    if (!_lessons || !Array.isArray(_lessons.categories)) return null;
    for (const category of _lessons.categories) {
      if (!category || !Array.isArray(category.weeks)) continue;
      for (const week of category.weeks) {
        if (!week || !Array.isArray(week.lessons)) continue;
        const lesson = week.lessons.find((l) => l && l.id === id);
        if (lesson) return { lesson, category, week: week.week };
      }
    }
    return null;
  } catch (err) {
    return null;
  }
}

/**
 * Flatten every lesson across every category/week.
 * @returns {Array<object>} lesson + categoryId, categoryName, week
 */
export function allLessons() {
  const out = [];
  try {
    if (!_lessons || !Array.isArray(_lessons.categories)) return out;
    for (const category of _lessons.categories) {
      if (!category || !Array.isArray(category.weeks)) continue;
      for (const week of category.weeks) {
        if (!week || !Array.isArray(week.lessons)) continue;
        for (const lesson of week.lessons) {
          if (!lesson) continue;
          out.push({
            ...lesson,
            categoryId: category.id,
            categoryName: category.name,
            week: week.week,
          });
        }
      }
    }
  } catch (err) {
    return out;
  }
  return out;
}

/**
 * @returns {{total:number, done:number, byCategory:Object<string,{total:number,done:number}>}}
 */
export function countProgress() {
  const result = { total: 0, done: 0, byCategory: {} };
  try {
    if (!_lessons || !Array.isArray(_lessons.categories)) return result;
    for (const category of _lessons.categories) {
      if (!category || !Array.isArray(category.weeks)) continue;
      const bucket = result.byCategory[category.id] || { total: 0, done: 0 };
      for (const week of category.weeks) {
        if (!week || !Array.isArray(week.lessons)) continue;
        for (const lesson of week.lessons) {
          if (!lesson) continue;
          result.total += 1;
          bucket.total += 1;
          if (isDone(lesson.id)) {
            result.done += 1;
            bucket.done += 1;
          }
        }
      }
      result.byCategory[category.id] = bucket;
    }
  } catch (err) {
    return result;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Progress (done/not-done per lesson id)
// ---------------------------------------------------------------------------

function readProgressMap() {
  const map = readJSON(STORAGE.progress, {});
  return map && typeof map === 'object' ? map : {};
}

function writeProgressMap(map) {
  writeJSON(STORAGE.progress, map);
}

export function isDone(id) {
  try {
    return !!readProgressMap()[id];
  } catch (err) {
    return false;
  }
}

/**
 * Flip completion state for a lesson, persist, bump streak when it becomes done.
 * @returns {boolean} the new done state
 */
export function toggleDone(id) {
  try {
    const map = readProgressMap();
    const next = !map[id];
    if (next) {
      map[id] = true;
    } else {
      delete map[id];
    }
    writeProgressMap(map);
    if (next) touchStreak();
    return next;
  } catch (err) {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Streak
// ---------------------------------------------------------------------------

function readStreak() {
  const s = readJSON(STORAGE.streak, { streak: 0, lastDate: '' });
  if (!s || typeof s !== 'object') return { streak: 0, lastDate: '' };
  return {
    streak: typeof s.streak === 'number' ? s.streak : 0,
    lastDate: typeof s.lastDate === 'string' ? s.lastDate : '',
  };
}

/**
 * Update the streak counter based on today's date.
 * - same day as lastDate  -> no-op
 * - lastDate === yesterday -> streak += 1
 * - otherwise             -> streak resets to 1
 */
export function touchStreak() {
  try {
    const today = todayStr();
    const current = readStreak();
    if (!today || current.lastDate === today) return;

    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const next = {
      streak: current.lastDate === yesterday ? current.streak + 1 : 1,
      lastDate: today,
    };
    writeJSON(STORAGE.streak, next);
  } catch (err) {
    // ignore
  }
}

export function getStreak() {
  return readStreak();
}

// ---------------------------------------------------------------------------
// Per-lesson AI-generated content cache
// ---------------------------------------------------------------------------

function readContentMap() {
  const map = readJSON(STORAGE.content, {});
  return map && typeof map === 'object' ? map : {};
}

export function getContent(id) {
  try {
    const map = readContentMap();
    return map[id] ?? null;
  } catch (err) {
    return null;
  }
}

export function setContent(id, obj) {
  try {
    const map = readContentMap();
    map[id] = obj;
    writeJSON(STORAGE.content, map);
  } catch (err) {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Tutor chat history: array of { role: 'user'|'model', text }
// ---------------------------------------------------------------------------

export function getTutorHistory() {
  const arr = readJSON(STORAGE.tutor, []);
  return Array.isArray(arr) ? arr : [];
}

export function setTutorHistory(arr) {
  writeJSON(STORAGE.tutor, Array.isArray(arr) ? arr : []);
}

export function clearTutorHistory() {
  writeJSON(STORAGE.tutor, []);
}

// ---------------------------------------------------------------------------
// Settings (merged over DEFAULT_SETTINGS)
// ---------------------------------------------------------------------------

export function getSettings() {
  try {
    const stored = readJSON(STORAGE.settings, {});
    return { ...DEFAULT_SETTINGS, ...(stored && typeof stored === 'object' ? stored : {}) };
  } catch (err) {
    return { ...DEFAULT_SETTINGS };
  }
}

export function setSettings(patch) {
  try {
    const merged = { ...getSettings(), ...(patch && typeof patch === 'object' ? patch : {}) };
    writeJSON(STORAGE.settings, merged);
    return merged;
  } catch (err) {
    return getSettings();
  }
}
