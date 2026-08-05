// js/voice.js — Voice conversation trainer: topic picker → live roleplay → AI review.
// Exports: renderVoice(root)

import { VOICE_TOPICS } from './config.js';
import { renderFurigana } from './furigana.js';
import { askJSON, askAudio } from './gemini.js';

// ---------------------------------------------------------------------------
// Gemini response schemas
// ---------------------------------------------------------------------------

const OPENING_SCHEMA = {
  type: 'OBJECT',
  properties: {
    reply: { type: 'STRING' },
    replyFurigana: { type: 'STRING' },
    vi: { type: 'STRING' },
  },
  required: ['reply', 'replyFurigana', 'vi'],
};

const TURN_SCHEMA = {
  type: 'OBJECT',
  properties: {
    heard: { type: 'STRING' },
    reply: { type: 'STRING' },
    replyFurigana: { type: 'STRING' },
    vi: { type: 'STRING' },
  },
  required: ['heard', 'reply', 'replyFurigana', 'vi'],
};

const REVIEW_SCHEMA = {
  type: 'OBJECT',
  properties: {
    overallVi: { type: 'STRING' },
    score: { type: 'NUMBER' },
    corrections: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          original: { type: 'STRING' },
          corrected: { type: 'STRING' },
          explainVi: { type: 'STRING' },
        },
      },
    },
    grammarPointsVi: { type: 'ARRAY', items: { type: 'STRING' } },
    vocabSuggestions: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { jp: { type: 'STRING' }, vi: { type: 'STRING' } },
      },
    },
    encouragementVi: { type: 'STRING' },
  },
  required: ['overallVi', 'score', 'corrections', 'grammarPointsVi', 'vocabSuggestions', 'encouragementVi'],
};

const REVIEW_SYSTEM = 'Bạn là giáo viên N2 khó tính nhưng thân thiện. Đánh giá đoạn hội thoại của người học.';

// ---------------------------------------------------------------------------
// Module state (persists across internal re-renders within the same mount)
// ---------------------------------------------------------------------------

let rootEl = null;
let mediaRecorder = null;
let mediaChunks = [];
let activeStream = null;

const state = {
  view: 'topics', // 'topics' | 'conversation' | 'review'
  topic: null,
  history: [], // [{role:'user'|'model', text}] sent to gemini
  transcript: [], // [{speaker:'learner'|'partner', jp, jpPlain, vi}] for display + review
  pending: false,
  error: '',
  micDenied: false,
  recording: false,
  review: null,
  reviewPending: false,
  reviewError: '',
};

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function esc(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stripFurigana(text) {
  return String(text == null ? '' : text).replace(/\{([^|{}]*)\|([^{}]*)\}/g, '$1');
}

function describeError(err) {
  const msg = err && err.message ? err.message : String(err);
  return `Đã có lỗi xảy ra: ${msg}. Vui lòng kiểm tra API key trong phần Cài đặt (⚙).`;
}

function buildSystemPrompt(topic) {
  return `Bạn là người Nhật, đang trò chuyện tự nhiên với người học N2 về chủ đề "${topic.jp}". Nói bằng tiếng Nhật tự nhiên, câu ngắn, mỗi lượt hỏi 1 câu để duy trì hội thoại. Trả về JSON {reply, replyFurigana, vi} — reply = câu tiếng Nhật, replyFurigana = cùng câu nhưng chú {漢字|かんじ}, vi = dịch tiếng Việt.`;
}

function buildTranscriptText(transcript) {
  return transcript
    .map((t) => `${t.speaker === 'learner' ? 'Học viên' : 'Đối tác'}: ${stripFurigana(t.jpPlain || t.jp || '')}`)
    .join('\n');
}

// ---------------------------------------------------------------------------
// Text-to-speech (ja-JP)
// ---------------------------------------------------------------------------

let cachedVoices = null;
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  window.speechSynthesis.addEventListener('voiceschanged', () => {
    cachedVoices = window.speechSynthesis.getVoices();
  });
}

function pickJaVoice() {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (voices && voices.length) cachedVoices = voices;
  const list = cachedVoices || voices || [];
  return list.find((v) => /^ja/i.test(v.lang) || /japan/i.test(v.name || '')) || null;
}

function speak(text) {
  const clean = stripFurigana(text).trim();
  if (!clean || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    const utter = new SpeechSynthesisUtterance(clean);
    utter.lang = 'ja-JP';
    const voice = pickJaVoice();
    if (voice) utter.voice = voice;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
  } catch (e) {
    // TTS is best-effort only; ignore failures silently.
  }
}

// ---------------------------------------------------------------------------
// Microphone recording helpers
// ---------------------------------------------------------------------------

function pickMimeType() {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return '';
  if (MediaRecorder.isTypeSupported('audio/webm')) return 'audio/webm';
  if (MediaRecorder.isTypeSupported('audio/mp4')) return 'audio/mp4';
  return '';
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const idx = result.indexOf(',');
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(reader.error || new Error('Không đọc được dữ liệu ghi âm.'));
    reader.readAsDataURL(blob);
  });
}

function releaseMic() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    try {
      mediaRecorder.stop();
    } catch (e) {
      // ignore
    }
  }
  if (activeStream) {
    activeStream.getTracks().forEach((t) => t.stop());
    activeStream = null;
  }
  mediaRecorder = null;
  mediaChunks = [];
}

async function startRecording() {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    state.micDenied = true;
    state.error = 'Thiết bị/trình duyệt không hỗ trợ ghi âm. Bạn vẫn có thể nhập văn bản bên dưới.';
    renderView();
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    activeStream = stream;
    const mimeType = pickMimeType();
    mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    mediaChunks = [];
    mediaRecorder.addEventListener('dataavailable', (e) => {
      if (e.data && e.data.size > 0) mediaChunks.push(e.data);
    });
    mediaRecorder.addEventListener('stop', onRecordingStop);
    mediaRecorder.start();
    state.recording = true;
    state.micDenied = false;
    state.error = '';
    renderView();
  } catch (err) {
    state.micDenied = true;
    state.recording = false;
    state.error = 'Không thể truy cập microphone (có thể do bị từ chối quyền). Bạn vẫn có thể nhập văn bản để trò chuyện.';
    renderView();
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  state.recording = false;
}

function toggleRecording() {
  if (state.pending) return;
  if (state.recording) {
    stopRecording();
  } else {
    startRecording();
  }
}

async function onRecordingStop() {
  const actualMimeType = (mediaRecorder && mediaRecorder.mimeType) || 'audio/webm';
  const blob = new Blob(mediaChunks, { type: actualMimeType });
  mediaChunks = [];
  if (activeStream) {
    activeStream.getTracks().forEach((t) => t.stop());
    activeStream = null;
  }
  if (!blob.size) {
    renderView();
    return;
  }
  state.pending = true;
  renderView();
  try {
    const audioBase64 = await blobToBase64(blob);
    const promptText =
      'Hãy nghe đoạn ghi âm tiếng Nhật của người học và trả lời JSON với: ' +
      '(1) heard = chép lại chính xác câu tiếng Nhật người học vừa nói (giữ nguyên, không tự sửa lỗi); ' +
      '(2) reply = câu tiếng Nhật tự nhiên, ngắn gọn để tiếp tục hội thoại; ' +
      '(3) replyFurigana = đúng câu reply nhưng chú thích {漢字|かんじ} cho mỗi từ có kanji; ' +
      '(4) vi = bản dịch tiếng Việt của reply. Chỉ trả JSON đúng schema, không thêm chữ nào khác.';
    const data = await askAudio({
      system: buildSystemPrompt(state.topic),
      history: state.history,
      audioBase64,
      mimeType: actualMimeType,
      promptText,
      schema: TURN_SCHEMA,
    });
    applyAudioTurnResult(data);
  } catch (err) {
    state.error = describeError(err);
  } finally {
    state.pending = false;
    renderView();
  }
}

function applyAudioTurnResult(data) {
  const heard = (data && data.heard) || '';
  const replyFurigana = (data && (data.replyFurigana || data.reply)) || '';
  const replyPlain = (data && data.reply) || stripFurigana(replyFurigana);
  const vi = (data && data.vi) || '';
  if (heard) {
    state.transcript.push({ speaker: 'learner', jp: heard, jpPlain: heard, vi: '' });
    state.history.push({ role: 'user', text: heard });
  }
  state.transcript.push({ speaker: 'partner', jp: replyFurigana, jpPlain: replyPlain, vi });
  state.history.push({ role: 'model', text: replyPlain });
  speak(replyPlain);
}

// ---------------------------------------------------------------------------
// Conversation flow
// ---------------------------------------------------------------------------

async function startConversation(topicId) {
  const topic = VOICE_TOPICS.find((t) => t.id === topicId) || VOICE_TOPICS[0];
  releaseMic();
  state.view = 'conversation';
  state.topic = topic;
  state.history = [];
  state.transcript = [];
  state.error = '';
  state.micDenied = false;
  state.recording = false;
  state.review = null;
  state.reviewError = '';
  state.pending = true;
  renderView();
  try {
    const data = await askJSON({
      system: buildSystemPrompt(topic),
      history: [],
      user: '会話を始めましょう。',
      schema: OPENING_SCHEMA,
    });
    const replyFurigana = (data && (data.replyFurigana || data.reply)) || '';
    const replyPlain = (data && data.reply) || stripFurigana(replyFurigana);
    const vi = (data && data.vi) || '';
    state.history.push({ role: 'model', text: replyPlain });
    state.transcript.push({ speaker: 'partner', jp: replyFurigana, jpPlain: replyPlain, vi });
    speak(replyPlain);
  } catch (err) {
    state.error = describeError(err);
  } finally {
    state.pending = false;
    renderView();
  }
}

async function sendTextTurn(rawText) {
  const trimmed = (rawText || '').trim();
  if (!trimmed || state.pending) return;
  state.transcript.push({ speaker: 'learner', jp: trimmed, jpPlain: trimmed, vi: '' });
  state.error = '';
  state.pending = true;
  renderView();
  try {
    const data = await askJSON({
      system: buildSystemPrompt(state.topic),
      history: state.history,
      user: trimmed,
      schema: OPENING_SCHEMA,
    });
    const replyFurigana = (data && (data.replyFurigana || data.reply)) || '';
    const replyPlain = (data && data.reply) || stripFurigana(replyFurigana);
    const vi = (data && data.vi) || '';
    state.history.push({ role: 'user', text: trimmed });
    state.history.push({ role: 'model', text: replyPlain });
    state.transcript.push({ speaker: 'partner', jp: replyFurigana, jpPlain: replyPlain, vi });
    speak(replyPlain);
  } catch (err) {
    state.error = describeError(err);
  } finally {
    state.pending = false;
    renderView();
  }
}

async function endAndReview() {
  if (state.pending || state.reviewPending) return;
  if (!state.transcript.length) {
    state.error = 'Chưa có nội dung hội thoại nào để đánh giá.';
    renderView();
    return;
  }
  releaseMic();
  state.view = 'review';
  state.reviewPending = true;
  state.reviewError = '';
  renderView();
  try {
    const transcriptText = buildTranscriptText(state.transcript);
    const data = await askJSON({
      system: REVIEW_SYSTEM,
      history: [],
      user: transcriptText,
      schema: REVIEW_SCHEMA,
    });
    state.review = data;
  } catch (err) {
    state.reviewError = describeError(err);
  } finally {
    state.reviewPending = false;
    renderView();
  }
}

function goToTopics() {
  releaseMic();
  state.view = 'topics';
  state.topic = null;
  state.history = [];
  state.transcript = [];
  state.error = '';
  state.micDenied = false;
  state.recording = false;
  state.pending = false;
  state.review = null;
  state.reviewError = '';
  state.reviewPending = false;
  renderView();
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderView() {
  if (!rootEl) return;
  if (state.view === 'conversation') {
    renderConversationView();
  } else if (state.view === 'review') {
    renderReviewView();
  } else {
    renderTopicPicker();
  }
}

function renderTopicPicker() {
  rootEl.innerHTML = `
    <section class="voice-page">
      <h2 class="section-title">🎙️ Luyện hội thoại theo chủ đề</h2>
      <p class="vi-sentence">Chọn một chủ đề bên dưới để bắt đầu trò chuyện cùng gia sư AI bằng tiếng Nhật.</p>
      <div class="topic-grid">
        ${VOICE_TOPICS.map(
          (t) => `
          <button type="button" class="tab-btn voice-topic-btn" data-topic-id="${esc(t.id)}">
            <span class="voice-topic-label">${esc(t.label)}</span>
            <span class="voice-topic-jp">${esc(t.jp)}</span>
          </button>`
        ).join('')}
      </div>
    </section>
  `;
  rootEl.querySelectorAll('.voice-topic-btn').forEach((btn) => {
    btn.addEventListener('click', () => startConversation(btn.getAttribute('data-topic-id')));
  });
}

function renderConversationView() {
  const topic = state.topic || VOICE_TOPICS[0];

  const bubbles = state.transcript
    .map((t) => {
      const isLearner = t.speaker === 'learner';
      const jpHtml = renderFurigana(t.jp || '');
      const viHtml = t.vi ? `<div class="vi-sentence">${esc(t.vi)}</div>` : '';
      const ttsBtn = !isLearner
        ? `<button type="button" class="tts-btn" data-speak="${esc(t.jpPlain || t.jp || '')}">🔊</button>`
        : '';
      return `
        <div class="chat-msg ${isLearner ? 'user' : 'model'}">
          <div class="jp-sentence">${jpHtml}${ttsBtn}</div>
          ${viHtml}
        </div>`;
    })
    .join('');

  const micLabel = state.recording ? '⏹ Dừng' : '⏺ Nói';
  const disabledAttr = state.pending ? 'disabled' : '';

  rootEl.innerHTML = `
    <section class="voice-page">
      <div class="lesson-toolbar">
        <button type="button" class="tts-btn back-btn" id="voice-back-btn">← Đổi chủ đề</button>
        <span class="lesson-meta">${esc(topic.label)} · ${esc(topic.jp)}</span>
      </div>
      <div class="chat-wrap" id="voice-chat-wrap">
        ${bubbles || '<p class="vi-sentence">Đang bắt đầu hội thoại...</p>'}
        ${state.pending ? '<div class="chat-msg model chat-loading"><em>Đang xử lý...</em></div>' : ''}
      </div>
      ${state.error ? `<p class="lesson-error">${esc(state.error)}</p>` : ''}
      ${
        state.micDenied
          ? '<p class="voice-note">🎙️ Không dùng được microphone. Bạn vẫn có thể nhập văn bản để trò chuyện bên dưới.</p>'
          : ''
      }
      <div class="chat-input-row">
        ${
          state.micDenied
            ? ''
            : `<button type="button" class="study-btn record-btn${state.recording ? ' recording' : ''}" id="voice-record-btn" ${disabledAttr}>${micLabel}</button>`
        }
        <input type="text" id="voice-text-input" placeholder="Hoặc nhập câu tiếng Nhật..." />
        <button type="button" class="study-btn" id="voice-send-btn" ${disabledAttr}>Gửi</button>
      </div>
      <button type="button" class="study-btn voice-end-btn" id="voice-end-btn">🔚 Kết thúc &amp; Đánh giá</button>
    </section>
  `;

  const backBtn = rootEl.querySelector('#voice-back-btn');
  if (backBtn) backBtn.addEventListener('click', goToTopics);

  const recordBtn = rootEl.querySelector('#voice-record-btn');
  if (recordBtn) recordBtn.addEventListener('click', toggleRecording);

  const sendBtn = rootEl.querySelector('#voice-send-btn');
  const textInput = rootEl.querySelector('#voice-text-input');
  const submitText = () => {
    if (!textInput) return;
    const val = textInput.value;
    textInput.value = '';
    sendTextTurn(val);
  };
  if (sendBtn) sendBtn.addEventListener('click', submitText);
  if (textInput) {
    textInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submitText();
      }
    });
  }

  rootEl.querySelectorAll('[data-speak]').forEach((btn) => {
    btn.addEventListener('click', () => speak(btn.getAttribute('data-speak') || ''));
  });

  const endBtn = rootEl.querySelector('#voice-end-btn');
  if (endBtn) endBtn.addEventListener('click', endAndReview);

  const wrap = rootEl.querySelector('#voice-chat-wrap');
  if (wrap) wrap.scrollTop = wrap.scrollHeight;
}

function renderReviewView() {
  if (state.reviewPending) {
    rootEl.innerHTML = `
      <section class="voice-page">
        <div class="review-card">
          <p>⏳ Đang phân tích hội thoại của bạn...</p>
        </div>
      </section>
    `;
    return;
  }

  if (state.reviewError) {
    rootEl.innerHTML = `
      <section class="voice-page">
        <div class="review-card">
          <p class="lesson-error">${esc(state.reviewError)}</p>
          <div class="review-actions">
            <button type="button" class="study-btn" id="voice-review-retry">Thử lại</button>
            <button type="button" class="study-btn" id="voice-review-back">← Chọn chủ đề khác</button>
          </div>
        </div>
      </section>
    `;
    const retryBtn = rootEl.querySelector('#voice-review-retry');
    const backBtn = rootEl.querySelector('#voice-review-back');
    if (retryBtn) retryBtn.addEventListener('click', endAndReview);
    if (backBtn) backBtn.addEventListener('click', goToTopics);
    return;
  }

  const r = state.review || {};
  const scoreNum = typeof r.score === 'number' ? r.score : parseFloat(r.score);
  const score = Number.isFinite(scoreNum) ? Math.max(0, Math.min(100, Math.round(scoreNum))) : null;
  const corrections = Array.isArray(r.corrections) ? r.corrections : [];
  const grammarPoints = Array.isArray(r.grammarPointsVi) ? r.grammarPointsVi : [];
  const vocabSuggestions = Array.isArray(r.vocabSuggestions) ? r.vocabSuggestions : [];
  const topicLabel = state.topic ? state.topic.label : '';

  rootEl.innerHTML = `
    <section class="voice-page">
      <div class="review-card">
        <h3>📊 Đánh giá hội thoại${topicLabel ? ` — ${esc(topicLabel)}` : ''}</h3>
        <p class="review-score">
          Điểm: ${score === null ? '—' : esc(String(score))}<span class="review-score-max">/100</span>
        </p>
        <p>${esc(r.overallVi || '')}</p>
        ${
          corrections.length
            ? `<h4>Sửa lỗi</h4>${corrections
                .map(
                  (c) => `
              <div class="example-box">
                <div class="jp-sentence correction-original">${esc(c.original || '')}</div>
                <div class="jp-sentence correction-fixed">${esc(c.corrected || '')}</div>
                <div class="vi-sentence">${esc(c.explainVi || '')}</div>
              </div>`
                )
                .join('')}`
            : ''
        }
        ${
          grammarPoints.length
            ? `<h4>Điểm ngữ pháp cần chú ý</h4>
               <ul class="review-grammar-list">${grammarPoints.map((g) => `<li class="quiz-option">${esc(g)}</li>`).join('')}</ul>`
            : ''
        }
        ${
          vocabSuggestions.length
            ? `<h4>Gợi ý từ vựng</h4>${vocabSuggestions
                .map(
                  (v) => `
              <div class="vocab-item"><strong>${renderFurigana(v.jp || '')}</strong> — <span class="vi-sentence">${esc(v.vi || '')}</span></div>`
                )
                .join('')}`
            : ''
        }
        <p class="review-encouragement">${esc(r.encouragementVi || '')}</p>
        <button type="button" class="study-btn" id="voice-review-back">← Chọn chủ đề khác</button>
      </div>
    </section>
  `;
  const backBtn = rootEl.querySelector('#voice-review-back');
  if (backBtn) backBtn.addEventListener('click', goToTopics);
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function renderVoice(root) {
  rootEl = root;
  releaseMic();
  state.view = 'topics';
  state.topic = null;
  state.history = [];
  state.transcript = [];
  state.pending = false;
  state.error = '';
  state.micDenied = false;
  state.recording = false;
  state.review = null;
  state.reviewPending = false;
  state.reviewError = '';
  renderView();
}
