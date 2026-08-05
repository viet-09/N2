// js/gemini.js
// Gemini REST client (no SDK) + a settings modal for editing apiKey/model.
// Endpoint: POST {GEMINI_BASE}/{model}:generateContent?key={apiKey}

import { GEMINI_BASE } from './config.js';
import { getSettings, setSettings } from './store.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Map stored chat history `{role:'user'|'model', text}` items to Gemini
 * `contents` turns.
 * @param {Array<{role?:string, text?:string}>} history
 * @returns {Array<{role:string, parts:Array<{text:string}>}>}
 */
function historyToContents(history) {
  const contents = [];
  if (!Array.isArray(history)) return contents;
  for (const turn of history) {
    if (!turn || turn.text === undefined || turn.text === null || turn.text === '') continue;
    contents.push({
      role: turn.role === 'model' ? 'model' : 'user',
      parts: [{ text: String(turn.text) }],
    });
  }
  return contents;
}

/**
 * POST a generateContent request and return the concatenated text of the
 * first candidate. Throws a readable Error on any failure (network, non-200
 * HTTP status, blocked content, or an empty response).
 * @param {string} model
 * @param {string} apiKey
 * @param {object} body
 * @returns {Promise<string>}
 */
async function callGemini(model, apiKey, body) {
  const url = `${GEMINI_BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (networkErr) {
    throw new Error(`Không thể kết nối tới Gemini API: ${networkErr && networkErr.message ? networkErr.message : networkErr}`);
  }

  let data = null;
  try {
    data = await res.json();
  } catch (parseErr) {
    data = null;
  }

  if (!res.ok) {
    const apiMsg = data && data.error && data.error.message ? data.error.message : null;
    throw new Error(apiMsg ? `Gemini API lỗi: ${apiMsg}` : `Gemini API lỗi: HTTP ${res.status}`);
  }

  const blockReason = data && data.promptFeedback && data.promptFeedback.blockReason;
  const candidate = data && Array.isArray(data.candidates) ? data.candidates[0] : null;

  if (!candidate) {
    throw new Error(blockReason ? `Nội dung bị chặn bởi Gemini (${blockReason}).` : 'Gemini không trả về kết quả nào.');
  }

  if (candidate.finishReason === 'SAFETY' || candidate.finishReason === 'RECITATION') {
    throw new Error(`Nội dung bị chặn bởi Gemini (${candidate.finishReason}).`);
  }

  const parts = (candidate.content && Array.isArray(candidate.content.parts)) ? candidate.content.parts : [];
  const text = parts.map((p) => (p && typeof p.text === 'string' ? p.text : '')).join('');

  if (!text) {
    throw new Error('Gemini trả về nội dung trống.');
  }

  return text;
}

function requireApiKey(apiKey) {
  if (!apiKey || !String(apiKey).trim()) {
    throw new Error('Chưa cấu hình API key Gemini. Vui lòng mở ⚙ Cài đặt để nhập key.');
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Ask Gemini a plain-text question.
 * @param {{system?:string, history?:Array<{role:string,text:string}>, user:string}} args
 * @returns {Promise<string>}
 */
export async function askText({ system, history = [], user }) {
  const { apiKey, model } = getSettings();
  requireApiKey(apiKey);

  const contents = historyToContents(history);
  contents.push({ role: 'user', parts: [{ text: String(user || '') }] });

  const body = {
    system_instruction: { parts: [{ text: String(system || '') }] },
    contents,
    generationConfig: { temperature: 0.7 },
  };

  return callGemini(model, apiKey, body);
}

/**
 * Ask Gemini for a JSON-shaped answer; the response text is JSON.parse'd.
 * @param {{system?:string, history?:Array<{role:string,text:string}>, user:string, schema?:object}} args
 * @returns {Promise<object>}
 */
export async function askJSON({ system, history = [], user, schema }) {
  const { apiKey, model } = getSettings();
  requireApiKey(apiKey);

  const contents = historyToContents(history);
  contents.push({ role: 'user', parts: [{ text: String(user || '') }] });

  const generationConfig = { temperature: 0.7, responseMimeType: 'application/json' };
  if (schema) generationConfig.responseSchema = schema;

  const body = {
    system_instruction: { parts: [{ text: String(system || '') }] },
    contents,
    generationConfig,
  };

  const text = await callGemini(model, apiKey, body);
  try {
    return JSON.parse(text);
  } catch (parseErr) {
    throw new Error(`Gemini trả về JSON không hợp lệ: ${parseErr.message}`);
  }
}

/**
 * Ask Gemini about a recorded audio clip (base64, no `data:` prefix).
 * If `schema` is given, the response is parsed as JSON; otherwise the raw
 * text is returned.
 * @param {{system?:string, history?:Array<{role:string,text:string}>, audioBase64:string, mimeType:string, promptText?:string, schema?:object}} args
 * @returns {Promise<object|string>}
 */
export async function askAudio({ system, history = [], audioBase64, mimeType, promptText, schema }) {
  const { apiKey, model } = getSettings();
  requireApiKey(apiKey);

  if (!audioBase64) {
    throw new Error('Thiếu dữ liệu âm thanh để gửi tới Gemini.');
  }

  const contents = historyToContents(history);
  const userParts = [];
  if (promptText) userParts.push({ text: String(promptText) });
  userParts.push({ inline_data: { mime_type: mimeType || 'audio/webm', data: audioBase64 } });
  contents.push({ role: 'user', parts: userParts });

  const generationConfig = { temperature: 0.7 };
  if (schema) {
    generationConfig.responseMimeType = 'application/json';
    generationConfig.responseSchema = schema;
  }

  const body = {
    system_instruction: { parts: [{ text: String(system || '') }] },
    contents,
    generationConfig,
  };

  const text = await callGemini(model, apiKey, body);

  if (schema) {
    try {
      return JSON.parse(text);
    } catch (parseErr) {
      throw new Error(`Gemini trả về JSON không hợp lệ: ${parseErr.message}`);
    }
  }

  return text;
}

// ---------------------------------------------------------------------------
// Settings modal
// ---------------------------------------------------------------------------

const MODAL_ID = 'gemini-settings-overlay';
const STYLE_ID = 'gemini-settings-styles';

const MODEL_SUGGESTIONS = [
  'gemini-3.5-flash-lite',
  'gemini-3.5-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.5-pro',
  'gemini-3.0-flash',
  'gemini-3.0-flash-lite',
];

/** Inject the settings-modal CSS once (self-contained; reuses existing tokens). */
function ensureSettingsStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
.settings-modal .modal-body { display: flex; flex-direction: column; gap: 6px; }
.settings-modal .settings-help {
  font-family: var(--font-sans, sans-serif);
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-muted, #6B7280);
  margin-bottom: 12px;
}
.settings-modal .settings-help a { color: var(--accent-red, #C84B31); text-decoration: underline; }
.settings-modal label {
  font-family: var(--font-sans, sans-serif);
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-primary, #1F2421);
  margin-top: 10px;
  margin-bottom: 6px;
  display: block;
}
.settings-modal input[type="password"],
.settings-modal input[type="text"] {
  width: 100%;
  min-height: 44px;
  padding: 10px 12px;
  font-family: var(--font-sans, sans-serif);
  font-size: 15px;
  border: 1px solid var(--border-color, #E5E0D8);
  border-radius: 4px;
  background: var(--bg-page, #FAF8F5);
  color: var(--text-primary, #1F2421);
  box-sizing: border-box;
}
.settings-modal input[type="password"]:focus,
.settings-modal input[type="text"]:focus {
  outline: 2px solid var(--accent-gold, #D4AF37);
  outline-offset: 1px;
}
.settings-modal .settings-toggle-key {
  margin-top: 6px;
  background: none;
  border: none;
  color: var(--text-muted, #6B7280);
  font-family: var(--font-sans, sans-serif);
  font-size: 12px;
  text-decoration: underline;
  cursor: pointer;
  min-height: 44px;
  padding: 0;
  align-self: flex-start;
}
.settings-modal .modal-close {
  min-width: 44px;
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.settings-modal .complete-modal-btn {
  min-height: 44px;
  min-width: 44px;
}
.settings-modal .settings-status {
  font-family: var(--font-sans, sans-serif);
  font-size: 12px;
  color: var(--text-muted, #6B7280);
}
.settings-modal .settings-status.ok { color: #4a7a4a; }
`;
  document.head.appendChild(style);
}

function closeExistingSettingsModal() {
  const existing = document.getElementById(MODAL_ID);
  if (existing) existing.remove();
}

/**
 * Build and show a modal (reusing the `.modal-overlay`/`.modal-card` look)
 * to edit the Gemini `apiKey` and `model` settings. Saves via
 * `store.setSettings` and closes on backdrop click, Escape, or the close
 * button.
 */
export function openSettings() {
  ensureSettingsStyles();
  closeExistingSettingsModal();

  const current = getSettings();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay settings-modal active';
  overlay.id = MODAL_ID;

  const card = document.createElement('div');
  card.className = 'modal-card';

  // Header ------------------------------------------------------------
  const header = document.createElement('div');
  header.className = 'modal-header';

  const title = document.createElement('h3');
  title.textContent = '⚙ Cài đặt Gemini AI';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'modal-close';
  closeBtn.setAttribute('aria-label', 'Đóng');
  closeBtn.innerHTML = '&times;';

  header.appendChild(title);
  header.appendChild(closeBtn);

  // Body ----------------------------------------------------------------
  const body = document.createElement('div');
  body.className = 'modal-body';

  const help = document.createElement('p');
  help.className = 'settings-help';
  help.textContent = 'API key Gemini đã được cấu hình sẵn — bạn không cần nhập gì để dùng gia sư AI, tạo bài học và luyện hội thoại. Nếu model báo lỗi, bạn có thể đổi model bên dưới.';

  const modelLabel = document.createElement('label');
  modelLabel.setAttribute('for', 'gemini-settings-model');
  modelLabel.textContent = 'Model';

  const modelInput = document.createElement('input');
  modelInput.type = 'text';
  modelInput.id = 'gemini-settings-model';
  modelInput.setAttribute('list', 'gemini-settings-model-options');
  modelInput.autocomplete = 'off';
  modelInput.spellcheck = false;
  modelInput.placeholder = 'gemini-3.5-flash-lite';
  modelInput.value = current.model || '';

  const datalist = document.createElement('datalist');
  datalist.id = 'gemini-settings-model-options';
  for (const m of MODEL_SUGGESTIONS) {
    const opt = document.createElement('option');
    opt.value = m;
    datalist.appendChild(opt);
  }

  body.appendChild(help);
  body.appendChild(modelLabel);
  body.appendChild(modelInput);
  body.appendChild(datalist);

  // Footer ----------------------------------------------------------------
  const footer = document.createElement('div');
  footer.className = 'modal-footer';

  const status = document.createElement('span');
  status.className = 'settings-status';

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'complete-modal-btn';
  saveBtn.textContent = 'Lưu';

  footer.appendChild(status);
  footer.appendChild(saveBtn);

  card.appendChild(header);
  card.appendChild(body);
  card.appendChild(footer);
  overlay.appendChild(card);
  document.body.appendChild(overlay);

  function onKeydown(e) {
    if (e.key === 'Escape') close();
  }

  function close() {
    overlay.removeEventListener('click', onOverlayClick);
    document.removeEventListener('keydown', onKeydown);
    overlay.remove();
  }

  function onOverlayClick(e) {
    if (e.target === overlay) close();
  }

  overlay.addEventListener('click', onOverlayClick);
  closeBtn.addEventListener('click', close);
  document.addEventListener('keydown', onKeydown);

  saveBtn.addEventListener('click', () => {
    const nextModel = modelInput.value.trim() || current.model;
    setSettings({ model: nextModel });
    status.textContent = 'Đã lưu!';
    status.classList.add('ok');
    setTimeout(close, 600);
  });

  // Focus the most useful field for keyboard/a11y users.
  modelInput.focus();
}
