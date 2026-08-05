// js/lesson.js — dedicated lesson page: content render + furigana + AI generate + TTS
import { findLesson, getContent, setContent, isDone, toggleDone } from './store.js';
import { navigate } from './router.js';
import { renderFurigana, setFurigana, getFurigana } from './furigana.js';
import { askJSON } from './gemini.js';

const AI_SYSTEM_PROMPT =
  'Bạn là một giáo viên tiếng Nhật chuyên nghiệp, soạn giáo trình JLPT N2 chuẩn xác. ' +
  'Chỉ trả về JSON hợp lệ đúng theo schema được yêu cầu, không thêm bất kỳ chữ nào khác ngoài JSON.';

/* ---------------------------------------------------------------------- */
/* small utils                                                            */
/* ---------------------------------------------------------------------- */

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sectionHeading(defaultLabel, practiceLabel, isPractice) {
  return isPractice ? practiceLabel : defaultLabel;
}

function resolveCorrectIndex(options, answer) {
  const list = Array.isArray(options) ? options : [];
  const target = String(answer ?? '').trim();
  const exact = list.findIndex((opt) => String(opt ?? '').trim() === target);
  if (exact !== -1) return exact;
  const n = Number(target);
  if (Number.isInteger(n)) {
    if (n >= 0 && n < list.length) return n;
    if (n >= 1 && n <= list.length) return n - 1;
  }
  return -1;
}

/* ---------------------------------------------------------------------- */
/* text-to-speech                                                         */
/* ---------------------------------------------------------------------- */

let jaVoicesCache = [];

function refreshVoices() {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  const list = window.speechSynthesis.getVoices();
  if (list && list.length) jaVoicesCache = list;
}

if (typeof window !== 'undefined' && window.speechSynthesis) {
  refreshVoices();
  window.speechSynthesis.addEventListener?.('voiceschanged', refreshVoices);
}

function pickJaVoice() {
  if (!jaVoicesCache.length) refreshVoices();
  return jaVoicesCache.find((v) => v.lang && v.lang.toLowerCase().startsWith('ja')) || null;
}

function stripFuriganaForSpeech(text) {
  return String(text ?? '')
    .replace(/\{([^{}|]*)\|([^{}]*)\}/g, '$1')
    .trim();
}

function speak(text) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  const clean = stripFuriganaForSpeech(text);
  if (!clean) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(clean);
  utter.lang = 'ja-JP';
  const voice = pickJaVoice();
  if (voice) utter.voice = voice;
  window.speechSynthesis.speak(utter);
}

function ttsButton(jpText) {
  const raw = jpText == null ? '' : String(jpText);
  if (!raw.trim()) return '';
  return `<button type="button" class="tts-btn" data-action="speak" data-jp="${escapeHtml(raw)}" aria-label="Nghe phát âm">🔊</button>`;
}

/* ---------------------------------------------------------------------- */
/* shared content fragments                                               */
/* ---------------------------------------------------------------------- */

function renderJpLine(line) {
  return `<div class="jp-sentence"><span class="jp-text">${renderFurigana(line)}</span>${ttsButton(line)}</div>`;
}

function renderJpLines(text) {
  const lines = String(text ?? '')
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return '<p class="text-muted">Chưa có nội dung.</p>';
  return lines.map(renderJpLine).join('');
}

function renderExampleBox(ex) {
  if (!ex) return '';
  const jp = ex.jp || '';
  return `
    <div class="example-box">
      <div class="jp-sentence"><span class="jp-text">${renderFurigana(jp)}</span>${ttsButton(jp)}</div>
      <div class="vi-sentence">${escapeHtml(ex.vi || '')}</div>
    </div>`;
}

function renderVocabList(vocabulary) {
  if (!Array.isArray(vocabulary) || !vocabulary.length) return '';
  const rows = vocabulary
    .map((v) => `<li>${renderFurigana(v?.word || '')} — ${escapeHtml(v?.vi || '')}</li>`)
    .join('');
  return `
    <div class="reading-vocab">
      <h3 class="subheading">Từ vựng cần biết</h3>
      <ul class="reading-vocab-list">${rows}</ul>
    </div>`;
}

function renderQuestion(q, index) {
  if (!q) return '';
  const options = Array.isArray(q.options) ? q.options : [];
  const correctIdx = resolveCorrectIndex(options, q.answer);
  const optionsHtml = options
    .map(
      (opt, idx) =>
        `<button type="button" class="quiz-option" data-action="quiz-option" data-idx="${idx}">${renderFurigana(opt)}</button>`
    )
    .join('');
  return `
    <div class="quiz-question" data-correct-idx="${correctIdx}">
      <div class="quiz-q-text">Câu ${index + 1}: ${renderFurigana(q.q || '')}</div>
      <div class="quiz-options">${optionsHtml}</div>
      <div class="quiz-explain" hidden>
        <div class="quiz-answer">Đáp án đúng: <strong>${renderFurigana(String(q.answer ?? ''))}</strong></div>
        ${q.explainVi ? `<div class="quiz-explain-vi">${escapeHtml(q.explainVi)}</div>` : ''}
      </div>
    </div>`;
}

function renderQuestions(questions) {
  if (!Array.isArray(questions) || !questions.length) return '';
  return `
    <div class="quiz-block">
      <h3 class="subheading">Câu hỏi luyện tập</h3>
      ${questions.map(renderQuestion).join('')}
    </div>`;
}

/* ---------------------------------------------------------------------- */
/* per-category content renderers                                         */
/* ---------------------------------------------------------------------- */

function renderGrammarContent(content, isPractice) {
  const heading = sectionHeading('Ngữ pháp', 'Đề luyện tập ngữ pháp', isPractice);
  const examples = Array.isArray(content.examples) ? content.examples : [];
  return `
    <section class="content-section grammar-section">
      <h2 class="section-heading">${escapeHtml(heading)}</h2>
      <div class="grammar-point">
        ${content.pattern ? `<div class="grammar-title">${renderFurigana(content.pattern)}</div>` : ''}
        ${content.meaningVi ? `<div class="grammar-meaning">${escapeHtml(content.meaningVi)}</div>` : ''}
        ${content.formation ? `<div class="grammar-formation"><strong>Cấu trúc:</strong> ${renderFurigana(content.formation)}</div>` : ''}
        ${content.explanationVi ? `<p class="grammar-explain">${escapeHtml(content.explanationVi)}</p>` : ''}
      </div>
      ${examples.length ? `<h3 class="subheading">Ví dụ</h3>${examples.map(renderExampleBox).join('')}` : ''}
      ${content.notes ? `<div class="lesson-notes"><strong>Ghi chú:</strong> ${escapeHtml(content.notes)}</div>` : ''}
    </section>`;
}

function renderVocabItem(item) {
  if (!item) return '';
  const word = item.word || '';
  const reading = item.reading || '';
  const headText = reading && reading !== word ? `{${word}|${reading}}` : word;
  return `
    <div class="vocab-item">
      <div class="vocab-word">${renderFurigana(headText)}</div>
      ${item.meaningVi ? `<div class="vocab-meaning">${escapeHtml(item.meaningVi)}</div>` : ''}
      ${item.example ? renderExampleBox(item.example) : ''}
    </div>`;
}

function renderVocabContent(content, isPractice) {
  const heading = sectionHeading('Từ vựng', 'Đề luyện tập từ vựng', isPractice);
  const items = Array.isArray(content.items) ? content.items : [];
  return `
    <section class="content-section vocab-section">
      <h2 class="section-heading">${escapeHtml(heading)}</h2>
      ${content.introVi ? `<p class="section-intro">${escapeHtml(content.introVi)}</p>` : ''}
      ${items.map(renderVocabItem).join('')}
    </section>`;
}

function renderKanjiItem(item) {
  if (!item) return '';
  const examples = Array.isArray(item.examples) ? item.examples : [];
  return `
    <div class="kanji-item">
      <div class="kanji-char">${escapeHtml(item.kanji || '')}</div>
      <div class="kanji-readings">
        ${item.on ? `<span class="kanji-on">Âm On: ${escapeHtml(item.on)}</span>` : ''}
        ${item.kun ? `<span class="kanji-kun">Âm Kun: ${escapeHtml(item.kun)}</span>` : ''}
      </div>
      ${item.meaningVi ? `<div class="kanji-meaning">${escapeHtml(item.meaningVi)}</div>` : ''}
      ${examples.map(renderExampleBox).join('')}
    </div>`;
}

function renderKanjiContent(content, isPractice) {
  const heading = sectionHeading('Hán tự', 'Đề luyện tập Hán tự', isPractice);
  const items = Array.isArray(content.items) ? content.items : [];
  return `
    <section class="content-section kanji-section">
      <h2 class="section-heading">${escapeHtml(heading)}</h2>
      ${content.introVi ? `<p class="section-intro">${escapeHtml(content.introVi)}</p>` : ''}
      ${items.map(renderKanjiItem).join('')}
    </section>`;
}

function renderReadingContent(content, isPractice) {
  const heading = sectionHeading('Đọc hiểu', 'Đề luyện tập đọc hiểu', isPractice);
  return `
    <section class="content-section reading-section">
      <h2 class="section-heading">${escapeHtml(heading)}</h2>
      ${content.title ? `<h3 class="passage-title">${renderFurigana(content.title)}</h3>` : ''}
      <div class="passage-block">${renderJpLines(content.passage)}</div>
      ${renderVocabList(content.vocabulary)}
      ${renderQuestions(content.questions)}
    </section>`;
}

function renderListeningContent(content, isPractice) {
  const heading = sectionHeading('Nghe hiểu', 'Đề luyện tập nghe hiểu', isPractice);
  return `
    <section class="content-section listening-section">
      <h2 class="section-heading">${escapeHtml(heading)}</h2>
      ${content.scenario ? `<p class="section-intro">${escapeHtml(content.scenario)}</p>` : ''}
      <div class="transcript-block">${renderJpLines(content.transcript)}</div>
      ${renderVocabList(content.vocabulary)}
      ${renderQuestions(content.questions)}
    </section>`;
}

function renderContentByCategory(categoryId, content, isPractice) {
  const safeContent = content && typeof content === 'object' ? content : {};
  switch (categoryId) {
    case 'grammar':
      return renderGrammarContent(safeContent, isPractice);
    case 'vocabulary':
      return renderVocabContent(safeContent, isPractice);
    case 'kanji':
      return renderKanjiContent(safeContent, isPractice);
    case 'reading':
      return renderReadingContent(safeContent, isPractice);
    case 'listening':
      return renderListeningContent(safeContent, isPractice);
    default:
      return '<p class="text-muted">Không có nội dung hiển thị cho danh mục này.</p>';
  }
}

/* ---------------------------------------------------------------------- */
/* AI generation: prompt + schema per category                            */
/* ---------------------------------------------------------------------- */

function buildPrompt(categoryId, lesson) {
  const title = lesson.title || '';
  const practiceNote =
    lesson.type === 'practice'
      ? ' Đây là bài luyện tập tổng hợp (thực chiến), hãy tạo nội dung ôn tập tổng hợp phù hợp trình độ N2.'
      : '';
  const furiganaNote = 'Trong mọi câu/từ tiếng Nhật, chú furigana theo dạng {漢字|かんじ} cho mỗi từ có kanji.';

  switch (categoryId) {
    case 'grammar':
      return `Bạn là giáo viên tiếng Nhật. Tạo bài học N2 cho mẫu ngữ pháp "${title}".${practiceNote} Trả về JSON: {pattern, meaningVi, formation, explanationVi, examples:[{jp,vi}](4-5 câu), notes}. ${furiganaNote}`;
    case 'vocabulary':
      return `Bạn là giáo viên tiếng Nhật. Tạo bài học từ vựng N2 theo chủ đề "${title}".${practiceNote} Trả về JSON: {introVi, items:[{word, reading, meaningVi, example:{jp,vi}}] (6-8 từ)}. ${furiganaNote}`;
    case 'kanji':
      return `Bạn là giáo viên tiếng Nhật. Tạo bài học Hán tự N2 theo chủ đề "${title}".${practiceNote} Trả về JSON: {introVi, items:[{kanji, on, kun, meaningVi, examples:[{jp,vi}] (2 câu mỗi kanji)}] (5-8 kanji)}. ${furiganaNote}`;
    case 'reading':
      return `Bạn là giáo viên tiếng Nhật. Tạo bài đọc hiểu N2 theo chủ đề "${title}".${practiceNote} Trả về JSON: {title, passage (đoạn văn 150-250 chữ, mỗi câu 1 dòng), vocabulary:[{word,vi}] (5-8 từ khó), questions:[{q, options:[4 lựa chọn], answer, explainVi}] (3-4 câu hỏi)}. ${furiganaNote}`;
    case 'listening':
      return `Bạn là giáo viên tiếng Nhật. Tạo bài luyện nghe N2 theo chủ đề "${title}".${practiceNote} Trả về JSON: {scenario, transcript (đoạn hội thoại/độc thoại có gắn tên người nói, mỗi câu 1 dòng), vocabulary:[{word,vi}] (5-8 từ khó), questions:[{q, options:[4 lựa chọn], answer, explainVi}] (3-4 câu hỏi)}. ${furiganaNote}`;
    default:
      return `Tạo nội dung học tiếng Nhật N2 cho bài "${title}". Trả về JSON hợp lệ. ${furiganaNote}`;
  }
}

function schemaFor(categoryId) {
  const STR = { type: 'STRING' };
  const jpViPair = {
    type: 'OBJECT',
    properties: { jp: STR, vi: STR },
    required: ['jp', 'vi'],
  };
  const wordViPair = {
    type: 'OBJECT',
    properties: { word: STR, vi: STR },
    required: ['word', 'vi'],
  };
  const questionSchema = {
    type: 'OBJECT',
    properties: {
      q: STR,
      options: { type: 'ARRAY', items: STR },
      answer: STR,
      explainVi: STR,
    },
    required: ['q', 'options', 'answer', 'explainVi'],
  };

  switch (categoryId) {
    case 'grammar':
      return {
        type: 'OBJECT',
        properties: {
          pattern: STR,
          meaningVi: STR,
          formation: STR,
          explanationVi: STR,
          examples: { type: 'ARRAY', items: jpViPair },
          notes: STR,
        },
        required: ['pattern', 'meaningVi', 'formation', 'explanationVi', 'examples'],
      };
    case 'vocabulary':
      return {
        type: 'OBJECT',
        properties: {
          introVi: STR,
          items: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: { word: STR, reading: STR, meaningVi: STR, example: jpViPair },
              required: ['word', 'reading', 'meaningVi', 'example'],
            },
          },
        },
        required: ['introVi', 'items'],
      };
    case 'kanji':
      return {
        type: 'OBJECT',
        properties: {
          introVi: STR,
          items: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                kanji: STR,
                on: STR,
                kun: STR,
                meaningVi: STR,
                examples: { type: 'ARRAY', items: jpViPair },
              },
              required: ['kanji', 'meaningVi', 'examples'],
            },
          },
        },
        required: ['introVi', 'items'],
      };
    case 'reading':
      return {
        type: 'OBJECT',
        properties: {
          title: STR,
          passage: STR,
          vocabulary: { type: 'ARRAY', items: wordViPair },
          questions: { type: 'ARRAY', items: questionSchema },
        },
        required: ['title', 'passage', 'questions'],
      };
    case 'listening':
      return {
        type: 'OBJECT',
        properties: {
          scenario: STR,
          transcript: STR,
          vocabulary: { type: 'ARRAY', items: wordViPair },
          questions: { type: 'ARRAY', items: questionSchema },
        },
        required: ['scenario', 'transcript', 'questions'],
      };
    default:
      return undefined;
  }
}

/* ---------------------------------------------------------------------- */
/* page chrome                                                            */
/* ---------------------------------------------------------------------- */

function renderToolbar(furiganaOn, done) {
  return `
    <div class="lesson-toolbar">
      <button type="button" class="back-btn" data-action="back" aria-label="Quay lại trang tổng quan">← Quay lại</button>
      <div class="lesson-toolbar-actions">
        <button type="button" class="furigana-toggle-btn" data-action="toggle-furigana" aria-pressed="${furiganaOn ? 'true' : 'false'}" title="Bật/tắt furigana">${furiganaOn ? 'あ' : 'ア'}</button>
        <button type="button" class="complete-toggle-btn${done ? ' is-done' : ''}" data-action="toggle-complete">${done ? 'Bỏ đánh dấu' : 'Đánh dấu đã học'}</button>
      </div>
    </div>`;
}

function renderHeader(lesson, category, week) {
  const typeLabel = lesson.type === 'practice' ? 'Thực chiến' : 'Bài học';
  const metaParts = [
    category?.name ? escapeHtml(category.name) : '',
    week?.week != null ? `Tuần ${escapeHtml(String(week.week))}` : '',
    lesson.day != null ? `Ngày ${escapeHtml(String(lesson.day))}` : '',
    escapeHtml(typeLabel),
  ].filter(Boolean);
  return `
    <header class="lesson-header">
      <div class="lesson-header-meta">${metaParts.join(' • ')}</div>
      <h1 class="lesson-header-title">${renderFurigana(lesson.title || '')}</h1>
    </header>`;
}

function renderEmptyState(generating, genError) {
  if (generating) {
    return `
      <div class="lesson-empty-state">
        <p class="lesson-loading">⏳ Đang tạo bài học bằng AI, vui lòng chờ...</p>
      </div>`;
  }
  return `
    <div class="lesson-empty-state">
      <p>Bài học này chưa có nội dung.</p>
      ${genError ? `<p class="lesson-error">⚠️ ${escapeHtml(genError)}</p>` : ''}
      <button type="button" class="ai-generate-btn" data-action="generate">✨ Tạo bài học bằng AI</button>
    </div>`;
}

function notFoundHtml() {
  return `
    <div class="lesson-page lesson-not-found">
      <p>Không tìm thấy bài học.</p>
      <button type="button" class="back-btn" data-action="back">← Quay lại</button>
    </div>`;
}

function pageHtml(lesson, category, week, content, generating, genError) {
  const furiganaOn = getFurigana();
  const done = isDone(lesson.id);
  const isPractice = lesson.type === 'practice';
  const bodyHtml = content
    ? renderContentByCategory(category?.id, content, isPractice)
    : renderEmptyState(generating, genError);
  return `
    <div class="lesson-page">
      ${renderToolbar(furiganaOn, done)}
      ${renderHeader(lesson, category, week)}
      <div class="lesson-body">${bodyHtml}</div>
    </div>`;
}

/* ---------------------------------------------------------------------- */
/* quiz interaction (pure DOM, no re-render needed)                       */
/* ---------------------------------------------------------------------- */

function handleQuizOptionClick(btn) {
  const container = btn.closest('.quiz-question');
  if (!container || container.classList.contains('is-answered')) return;
  container.classList.add('is-answered');

  const correctIdx = Number(container.dataset.correctIdx);
  const clickedIdx = Number(btn.dataset.idx);

  container.querySelectorAll('.quiz-option').forEach((optBtn) => {
    optBtn.disabled = true;
    const idx = Number(optBtn.dataset.idx);
    if (!Number.isNaN(correctIdx) && idx === correctIdx) {
      optBtn.classList.add('is-correct');
    } else if (idx === clickedIdx) {
      optBtn.classList.add('is-incorrect');
    }
  });

  const explain = container.querySelector('.quiz-explain');
  if (explain) explain.hidden = false;
}

/* ---------------------------------------------------------------------- */
/* main export                                                            */
/* ---------------------------------------------------------------------- */

export function renderLesson(root, id) {
  // remove any click listener bound by a previous renderLesson() call so we
  // never stack duplicate handlers on the shared #app root across navigations
  if (root.__lessonClickHandler) {
    root.removeEventListener('click', root.__lessonClickHandler);
    root.__lessonClickHandler = null;
  }

  let generating = false;
  let genError = '';

  function paint() {
    const found = findLesson(id);
    if (!found) {
      root.innerHTML = notFoundHtml();
      return;
    }
    const { lesson, category, week } = found;
    const content = lesson.content || getContent(id) || null;
    root.innerHTML = pageHtml(lesson, category, week, content, generating, genError);
  }

  async function handleGenerate() {
    const found = findLesson(id);
    if (!found || !found.category) return;
    const { lesson, category } = found;

    generating = true;
    genError = '';
    paint();

    try {
      const prompt = buildPrompt(category.id, lesson);
      const schema = schemaFor(category.id);
      const obj = await askJSON({ system: AI_SYSTEM_PROMPT, user: prompt, schema });
      if (!obj || typeof obj !== 'object') {
        throw new Error('Phản hồi AI không hợp lệ, vui lòng thử lại.');
      }
      setContent(id, obj);
    } catch (err) {
      genError = err && err.message ? err.message : 'Không thể tạo bài học. Vui lòng thử lại.';
    } finally {
      generating = false;
      paint();
    }
  }

  function handleClick(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === 'back') {
      navigate('#/');
    } else if (action === 'toggle-furigana') {
      setFurigana(!getFurigana());
      paint();
    } else if (action === 'toggle-complete') {
      toggleDone(id);
      paint();
    } else if (action === 'generate') {
      handleGenerate();
    } else if (action === 'speak') {
      speak(btn.dataset.jp || '');
    } else if (action === 'quiz-option') {
      handleQuizOptionClick(btn);
    }
  }

  root.__lessonClickHandler = handleClick;
  root.addEventListener('click', handleClick);

  paint();
}
