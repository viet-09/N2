// js/tutor.js
// AI text tutor chat: renders inside #app, persists conversation via store.js,
// drives Gemini through gemini.js, and renders Japanese via furigana.js.

import { TUTOR_SYSTEM_PROMPT } from './config.js';
import { getTutorHistory, setTutorHistory, clearTutorHistory } from './store.js';
import { renderFurigana } from './furigana.js';
import { askText, openSettings } from './gemini.js';

const FIRST_CHALLENGE_PROMPT = '始めましょう。最初の課題をください。';

// Module state — one tutor view is mounted at a time.
let rootEl = null;
let history = [];
let isLoading = false;
let errorText = null;

/**
 * Render the tutor chat UI into `root`.
 * @param {HTMLElement} root
 */
export function renderTutor(root) {
  rootEl = root;
  isLoading = false;
  errorText = null;
  history = getTutorHistory();

  root.innerHTML = shellTemplate();
  bindShellEvents();
  paintMessages();

  if (history.length === 0) {
    fetchFirstChallenge();
  } else {
    scrollToBottom();
  }
}

// ---------------------------------------------------------------------------
// Shell (rendered once per renderTutor call)
// ---------------------------------------------------------------------------

function shellTemplate() {
  return `
    <div class="chat-wrap">
      <div class="chat-toolbar">
        <button type="button" id="tutor-clear-btn" class="chat-clear-btn">
          🗑️ Xóa hội thoại
        </button>
        <button type="button" id="tutor-settings-btn" class="chat-settings-btn">
          ⚙ Cài đặt
        </button>
      </div>
      <div class="chat-messages" id="tutor-messages"></div>
      <form class="chat-input-row" id="tutor-form">
        <input
          type="text"
          id="tutor-input"
          placeholder="Nhập câu trả lời của bạn..."
          autocomplete="off"
          autocapitalize="off"
        />
        <button
          type="submit"
          id="tutor-send-btn"
          class="chat-send-btn"
        >
          Gửi
        </button>
      </form>
    </div>
  `;
}

function bindShellEvents() {
  const form = rootEl.querySelector('#tutor-form');
  const clearBtn = rootEl.querySelector('#tutor-clear-btn');
  const settingsBtn = rootEl.querySelector('#tutor-settings-btn');
  const messagesEl = rootEl.querySelector('#tutor-messages');

  if (form) {
    form.addEventListener('submit', (evt) => {
      evt.preventDefault();
      const input = rootEl.querySelector('#tutor-input');
      if (!input) return;
      const text = input.value;
      input.value = '';
      handleSend(text);
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (isLoading) return;
      clearTutorHistory();
      history = [];
      errorText = null;
      paintMessages();
      fetchFirstChallenge();
    });
  }

  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      openSettings();
    });
  }

  // Delegated click handler for per-message TTS buttons (survives innerHTML repaints
  // of #tutor-messages because the container element itself is never replaced).
  if (messagesEl) {
    messagesEl.addEventListener('click', (evt) => {
      const btn = evt.target.closest('.tts-btn');
      if (!btn || !messagesEl.contains(btn)) return;
      const idx = Number(btn.getAttribute('data-tts-idx'));
      const msg = history[idx];
      if (msg && typeof msg.text === 'string') speak(msg.text);
    });
  }
}

// ---------------------------------------------------------------------------
// Message flow
// ---------------------------------------------------------------------------

async function fetchFirstChallenge() {
  isLoading = true;
  errorText = null;
  paintMessages();
  setFormDisabled(true);

  try {
    const reply = await askText({ system: TUTOR_SYSTEM_PROMPT, history: [], user: FIRST_CHALLENGE_PROMPT });
    history = [{ role: 'model', text: reply }];
    setTutorHistory(history);
    isLoading = false;
  } catch (err) {
    isLoading = false;
    errorText = messageFromError(err);
  }

  setFormDisabled(false);
  paintMessages();
  scrollToBottom();
}

async function handleSend(rawText) {
  const text = String(rawText || '').trim();
  if (!text || isLoading) return;

  const priorHistory = history.slice();
  history = [...priorHistory, { role: 'user', text }];
  setTutorHistory(history);
  errorText = null;
  isLoading = true;
  paintMessages();
  setFormDisabled(true);
  scrollToBottom();

  try {
    const reply = await askText({ system: TUTOR_SYSTEM_PROMPT, history: priorHistory, user: text });
    history = [...history, { role: 'model', text: reply }];
    setTutorHistory(history);
    isLoading = false;
  } catch (err) {
    isLoading = false;
    errorText = messageFromError(err);
  }

  setFormDisabled(false);
  paintMessages();
  scrollToBottom();
}

function messageFromError(err) {
  const raw = err && err.message ? String(err.message) : 'Đã có lỗi không xác định.';
  return raw;
}

function setFormDisabled(disabled) {
  if (!rootEl) return;
  const input = rootEl.querySelector('#tutor-input');
  const sendBtn = rootEl.querySelector('#tutor-send-btn');
  const clearBtn = rootEl.querySelector('#tutor-clear-btn');
  if (input) input.disabled = disabled;
  if (sendBtn) sendBtn.disabled = disabled;
  if (clearBtn) clearBtn.disabled = disabled;
  if (!disabled && input) input.focus();
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function paintMessages() {
  const container = rootEl && rootEl.querySelector('#tutor-messages');
  if (!container) return;

  const parts = history.map((msg, idx) => renderMessage(msg, idx));
  if (isLoading) parts.push(loadingBubble());
  if (errorText) parts.push(errorBubble(errorText));

  container.innerHTML = parts.join('') || emptyState();
}

function renderMessage(msg, idx) {
  const isUser = msg.role === 'user';
  const roleClass = isUser ? 'user' : 'model';

  const bodyHtml = isUser
    ? escapeHtml(msg.text).replace(/\r\n|\r|\n/g, '<br>')
    : renderFurigana(msg.text);

  const ttsBtn = isUser
    ? ''
    : `<button type="button" class="tts-btn" data-tts-idx="${idx}" aria-label="Phát âm">🔊</button>`;

  return `
    <div class="chat-msg ${roleClass}">
      <div class="chat-msg-row">
        <div class="chat-msg-bubble">${bodyHtml}</div>
        ${ttsBtn}
      </div>
    </div>
  `;
}

function loadingBubble() {
  return `
    <div class="chat-msg model chat-loading">
      <div class="chat-msg-bubble">
        Đang soạn câu trả lời…
      </div>
    </div>
  `;
}

function errorBubble(message) {
  return `
    <div class="chat-msg model chat-error">
      <div class="chat-msg-bubble">
        ⚠️ Rất tiếc, đã có lỗi xảy ra: ${escapeHtml(message)}<br>
        Vui lòng kiểm tra API key trong phần cài đặt (⚙) rồi thử lại.
      </div>
    </div>
  `;
}

function emptyState() {
  return `
    <div class="chat-empty">
      Chưa có tin nhắn nào.
    </div>
  `;
}

function scrollToBottom() {
  const container = rootEl && rootEl.querySelector('#tutor-messages');
  if (container) container.scrollTop = container.scrollHeight;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Strip {base|reading} furigana markup down to the base text for TTS. */
function stripFuriganaMarkup(text) {
  return String(text).replace(/\{([^{}|]+)\|([^{}|]+)\}/g, '$1');
}

/** Speak Japanese text aloud using SpeechSynthesis (ja-JP), preferring a ja voice. */
function speak(text) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  const plain = stripFuriganaMarkup(text);
  if (!plain.trim()) return;

  try {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(plain);
    utter.lang = 'ja-JP';
    const voices = window.speechSynthesis.getVoices();
    const jaVoice = voices.find((v) => v && v.lang && v.lang.toLowerCase().startsWith('ja'));
    if (jaVoice) utter.voice = jaVoice;
    window.speechSynthesis.speak(utter);
  } catch (err) {
    // Speech synthesis unsupported/blocked — silently ignore.
  }
}
