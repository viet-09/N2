// js/furigana.js
// Furigana markup renderer + global on/off toggle.
// Markup convention: {漢字|かんじ} -> <ruby>漢字<rt>かんじ</rt></ruby>
// Plain text passes through untouched (aside from HTML-escaping). "\n" becomes <br>.

import { getSettings, setSettings } from './store.js';

const FURIGANA_OFF_CLASS = 'furigana-off';

// Matches {base|reading} — base/reading may not contain '{', '}' or '|'.
const FURIGANA_PATTERN = /\{([^{}|]+)\|([^{}|]+)\}/g;
const NEWLINE_PATTERN = /\r\n|\r|\n/g;

/**
 * Escape a string for safe insertion as HTML text content.
 * @param {*} value
 * @returns {string}
 */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Render furigana markup into trusted HTML.
 * `{base|reading}` becomes `<ruby>base<rt>reading</rt></ruby>` (base & reading escaped).
 * Any text outside the markup is HTML-escaped and passes through as-is.
 * Newlines become `<br>`.
 * @param {string|null|undefined} text
 * @returns {string} trusted HTML string
 */
export function renderFurigana(text) {
  if (text == null) return '';
  const str = String(text);

  let html = '';
  let lastIndex = 0;
  let match;

  FURIGANA_PATTERN.lastIndex = 0;
  while ((match = FURIGANA_PATTERN.exec(str)) !== null) {
    const plain = str.slice(lastIndex, match.index);
    html += escapeHtml(plain);

    const base = match[1];
    const reading = match[2];
    // <rb> wrapper is required by the HTML5 ruby spec so the base text is
    // unmistakably the "ruby base" and not an annotation. Browsers that fall
    // back to inline rendering (Edge legacy, some mobile) still treat the
    // base text as the visual anchor and only float <rt> above/below it.
    html += `<ruby><rb>${escapeHtml(base)}</rb><rt>${escapeHtml(reading)}</rt></ruby>`;

    lastIndex = match.index + match[0].length;
  }
  html += escapeHtml(str.slice(lastIndex));

  return html.replace(NEWLINE_PATTERN, '<br>');
}

/**
 * Apply (or remove) the body-level furigana-off class.
 * @param {boolean} isOn
 */
function applyFuriganaClass(isOn) {
  if (typeof document === 'undefined' || !document.body) return;
  document.body.classList.toggle(FURIGANA_OFF_CLASS, !isOn);
}

/**
 * Read the persisted furigana setting and apply the body class accordingly.
 * Does not create any toggle button — callers own their own UI.
 */
export function initFuriganaToggle() {
  const { furigana } = getSettings();
  applyFuriganaClass(!!furigana);
}

/**
 * Turn furigana rendering on/off globally: toggles body.furigana-off and persists the choice.
 * @param {boolean} on
 */
export function setFurigana(on) {
  const isOn = !!on;
  applyFuriganaClass(isOn);
  setSettings({ furigana: isOn });
}

/**
 * @returns {boolean} current furigana setting
 */
export function getFurigana() {
  return !!getSettings().furigana;
}
