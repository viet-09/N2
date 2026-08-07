// js/lesson.js — book-backed lesson renderer, quizzes, TTS, tutor context,
// and cached Vietnamese explanations for tappable Japanese headwords.
import {
  findLesson,
  getBookContent,
  getKanjiGloss,
  setKanjiGloss,
  setTutorContext,
  clearTutorHistory,
  isDone,
  toggleDone,
} from './store.js';
import { navigate, getCurrentRoute, isRouteActive } from './router.js';
import { renderFurigana, setFurigana, getFurigana } from './furigana.js';
import { askText } from './gemini.js';
import { renderTutor } from './tutor.js';
import { getQuestionClassification, getLessonImages } from './store.js';
import { questionTypeInfo } from './question-types.js';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
}

function plainJapanese(value) {
  return String(value ?? '').replace(/\{([^{}|]*)\|([^{}]*)\}/g, '$1').trim();
}

// Grammar `form`/`connection` fields transcribe the book's own conjugation-grouping
// notation, including a literal <s>…</s> strikethrough mark for the part that's dropped
// (e.g. "V<s>ます</s>がち"). renderFurigana HTML-escapes everything, so re-open just that
// one known-safe tag pair afterward — never re-open anything else.
function renderGrammarNotation(value) {
  return renderFurigana(value)
    .replace(/&lt;s&gt;/g, '<s>')
    .replace(/&lt;\/s&gt;/g, '</s>');
}

let voices = [];
function refreshVoices() {
  if (typeof speechSynthesis !== 'undefined') voices = speechSynthesis.getVoices() || [];
}
if (typeof speechSynthesis !== 'undefined') {
  refreshVoices();
  speechSynthesis.addEventListener?.('voiceschanged', refreshVoices);
}

function speak(text) {
  if (typeof speechSynthesis === 'undefined') return;
  const clean = plainJapanese(text);
  if (!clean) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(clean);
  utterance.lang = 'ja-JP';
  utterance.voice = voices.find((voice) => /^ja(?:-|$)/i.test(voice.lang || '')) || null;
  speechSynthesis.speak(utterance);
}

function ttsButton(text) {
  if (!String(text || '').trim()) return '';
  return `<button type="button" class="tts-btn" data-action="speak" data-jp="${escapeHtml(text)}" aria-label="Nghe phát âm tiếng Nhật">🔊</button>`;
}

function wordButton(word, reading = '', label = null) {
  const display = label || (reading && reading !== word ? `{${word}|${reading}}` : word);
  return `<button type="button" class="explain-word-btn" data-action="explain-word" data-word="${escapeHtml(word)}" data-reading="${escapeHtml(reading)}" lang="ja">${renderFurigana(display)}</button>`;
}

function renderJapaneseLine(text, className = 'jp-sentence') {
  return `<div class="${className}" lang="ja"><button type="button" class="jp-text explain-word-btn" data-action="explain-sentence" data-jp="${escapeHtml(text || '')}" aria-label="Dịch câu này sang tiếng Việt">${renderFurigana(text || '')}</button>${ttsButton(text)}</div>`;
}

function answerIndex(question) {
  const index = Number(question?.answerIndex);
  return Number.isInteger(index) ? index : -1;
}

function renderQuestionHeader(lessonId, questionIndex) {
  const info = getQuestionClassification(lessonId, questionIndex);
  if (!info) return '';
  const t = questionTypeInfo(info.type);
  const label = escapeHtml(t.label || info.type);
  const tip = t.tip ? ` title="${escapeHtml(t.tip)}" aria-label="${escapeHtml(t.tip)}"` : '';
  return `<header class="quiz-q-header"><span class="quiz-q-type-badge" data-question-type="${escapeHtml(info.type)}"${tip}>${label}</span></header>`;
}

function renderImagesSection(lessonId) {
  const images = getLessonImages(lessonId);
  if (!Array.isArray(images) || images.length === 0) return '';
  const items = images.map((entry) => {
    if (!entry || typeof entry.src !== 'string') return '';
    const src = entry.src.startsWith('/') ? entry.src : `data/book/${entry.src}`;
    const caption = entry.captionVi ? `<figcaption class="lesson-image-caption">${escapeHtml(entry.captionVi)}</figcaption>` : '';
    const isPage = entry.kind === 'page';
    if (isPage) {
      return `<details class="lesson-image-page"><summary>Trang sách gốc</summary><figure class="lesson-image-figure"><img loading="lazy" src="${escapeHtml(src)}" alt="Trang sách">${caption}</figure></details>`;
    }
    return `<figure class="lesson-image-figure"><img loading="lazy" src="${escapeHtml(src)}" alt="${escapeHtml(entry.captionVi || 'Hình minh họa')}">${caption}</figure>`;
  }).filter(Boolean).join('');
  if (!items) return '';
  return `<section class="lesson-images" aria-label="Hình minh họa">${items}</section>`;
}

function renderQuestions(questions, lessonId, title = 'Luyện tập') {
  if (!Array.isArray(questions) || !questions.length) return '';
  const groups = groupQuestionsBySection(questions);
  return `
    <section class="quiz-block" aria-labelledby="quiz-heading">
      <h3 class="subheading" id="quiz-heading">${escapeHtml(title)}</h3>
      ${groups.map((group) => `
        <div class="quiz-section">
          ${group.label ? `<h4 class="quiz-section-title" lang="ja">${escapeHtml(group.label)}</h4>` : ''}
          ${group.items.map((item) => renderQuestionItem(item, lessonId)).join('')}
        </div>`).join('')}
    </section>`;
}

// Grammar book splits practice into 練習I (binary a/b: choose correct form) and
// 練習II (4-blank: ＿＿ ＿＿ ＿＿ ＿＿ — pick correct order). Each 練習II item
// is stored as 4 sibling entries with the prompt suffix "(Chỗ trống thứ N …)";
// we collapse them into one rendered question whose answer is the list of
// per-blank option indexes.
function groupQuestionsBySection(questions) {
  const groups = [];
  let current = { label: '', items: [] };
  const pushCurrent = () => { if (current.items.length) groups.push(current); current = { label: '', items: [] }; };
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const opts = Array.isArray(q?.options) ? q.options : [];
    const probe = stripBlankSuffix(q?.prompt || q?.q || '');
    let k = 1;
    while (i + k < questions.length
      && (questions[i + k].options || []).length === opts.length
      && stripBlankSuffix(questions[i + k].prompt || questions[i + k].q || '') === probe) {
      k++;
    }
    if (k >= 2 && opts.length >= 3) {
      const collapsed = collapseMultiBlank(questions.slice(i, i + k), i);
      i += k - 1;
      const isRoman = /\(a\.|（a\.|a\. +[ぁ-んァ-ン一-龯]/.test(collapsed.prompt);
      if (isRoman && current.label !== '練習Ⅰ') {
        pushCurrent();
        current.label = '練習Ⅰ';
      } else if (!isRoman && current.label === '練習Ⅰ') {
        pushCurrent();
        current.label = '練習Ⅱ';
      }
      current.items.push(collapsed);
      continue;
    }
    if (opts.length === 2 && current.label !== '練習Ⅰ') {
      pushCurrent();
      current.label = '練習Ⅰ';
    } else if (opts.length >= 3 && current.label !== '練習Ⅱ') {
      pushCurrent();
      current.label = '練習Ⅱ';
    }
    current.items.push(q);
  }
  pushCurrent();
  return groups;
}

function stripBlankSuffix(prompt) {
  // Strip the book's "Chỗ trống thứ N" suffix (single or nested parens).
  return String(prompt || '')
    .replace(/\s*[\(（]\s*Chỗ\s*trống\s*thứ\s*\d+(?:\s*[\(（][^()）]*[\)）])?\s*[\)）]\s*$/u, '')
    .trim();
}

function collapseMultiBlank(entries, originalIndex) {
  const first = entries[0];
  const opts = first.options || [];
  const basePrompt = stripBlankSuffix(first.prompt || first.q || '');
  const blankCount = entries.length;
  const correctFor = entries.map((e) => Number.isInteger(e.answerIndex) ? e.answerIndex : -1);
  return {
    prompt: basePrompt,
    options: opts,
    blanks: blankCount,
    answers: correctFor,
    multiBlank: true,
    _originalIndex: originalIndex,
  };
}

function renderQuestionItem(question, lessonId, questionIndex) {
  const options = Array.isArray(question?.options) ? question.options : [];
  const headerIndex = question?._originalIndex ?? questionIndex;
  const header = renderQuestionHeader(lessonId, headerIndex);
  if (question?.multiBlank) {
    const blanks = question.blanks || question.answers.length;
    const answersAttr = JSON.stringify(question.answers || []);
    return `
      <div class="quiz-question quiz-question-multiblank" data-blanks="${blanks}" data-answers='${escapeHtml(answersAttr)}'>
        ${header}
        <div class="quiz-q-text" lang="ja">${renderFurigana(question.prompt)}</div>
        <div class="quiz-blanks" aria-label="Thứ tự các chỗ trống">
          ${Array.from({ length: blanks }, (_, n) => `<span class="quiz-blank-slot" data-slot="${n}">(${n + 1})</span>`).join('')}
        </div>
        <div class="quiz-options">
          ${options.map((option, optionIndex) => `<button type="button" class="quiz-option" data-action="quiz-option" data-idx="${optionIndex}" lang="ja">${renderFurigana(option)}</button>`).join('')}
        </div>
        <div class="quiz-explain" role="status" hidden></div>
      </div>`;
  }
  const correct = answerIndex(question);
  return `
    <div class="quiz-question" data-correct-idx="${correct}">
      ${header}
      <div class="quiz-q-text" lang="ja">${renderFurigana(question?.prompt || question?.q || '')}</div>
      <div class="quiz-options">
        ${options.map((option, optionIndex) => `<button type="button" class="quiz-option" data-action="quiz-option" data-idx="${optionIndex}" lang="ja">${renderFurigana(option)}</button>`).join('')}
      </div>
      <div class="quiz-explain" role="status" hidden></div>
    </div>`;
}

function renderKanji(lessonId, content) {
  const cards = (Array.isArray(content.kanji) ? content.kanji : []).map((item) => `
    <article class="kanji-item">
      <div class="kanji-char">${wordButton(item?.char || '', [item?.on, item?.kun].filter(Boolean).join(' / '))}</div>
      <div class="kanji-readings" lang="ja">
        ${item?.on ? `<span class="kanji-on">音: ${escapeHtml(item.on)}</span>` : ''}
        ${item?.kun ? `<span class="kanji-kun">訓: ${escapeHtml(item.kun)}</span>` : ''}
        ${Number.isFinite(Number(item?.strokes)) ? `<span>${escapeHtml(item.strokes)} nét</span>` : ''}
      </div>
      <ul class="kanji-word-list">
        ${(Array.isArray(item?.words) ? item.words : []).map((word) => `<li>${wordButton(word?.jp || '', word?.reading || '')}<span class="book-meaning" lang="en">${escapeHtml(word?.en || '')}</span></li>`).join('')}
      </ul>
    </article>`).join('');
  const review = Array.isArray(content.reviewKanji) ? content.reviewKanji : [];
  return `
    <section class="content-section kanji-section">
      <h2 class="section-heading">Hán tự</h2>
      ${renderImagesSection(lessonId)}
      <div class="kanji-grid">${cards || '<p class="text-muted">Không có mục Hán tự trong bài này.</p>'}</div>
      ${review.length ? `<section class="review-kanji"><h3 class="subheading" lang="ja">よめるかな？</h3><div class="review-kanji-list">${review.map((item) => wordButton(item?.char || '', [item?.on, item?.kun].filter(Boolean).join(' / '))).join('')}</div></section>` : ''}
      ${renderQuestions(content.practice, lessonId, '練習 · Luyện tập')}
    </section>`;
}

function renderVocabulary(lessonId, content) {
  const sections = (Array.isArray(content.sections) ? content.sections : []).map((section) => `
    <section class="vocab-book-section">
      ${section?.heading ? `<h3 class="subheading" lang="ja">${renderFurigana(section.heading)}</h3>` : ''}
      <div class="vocab-list">
        ${(Array.isArray(section?.words) ? section.words : []).map((word) => `
          <article class="vocab-item">
            <div class="vocab-word">${wordButton(word?.jp || '', word?.reading || '')}</div>
            <div class="vocab-meaning" lang="en">${escapeHtml(word?.en || '')}</div>
            ${word?.note ? `<div class="lesson-notes" lang="en">${escapeHtml(word.note)}</div>` : ''}
          </article>`).join('')}
      </div>
    </section>`).join('');
  return `<section class="content-section vocab-section"><h2 class="section-heading">Từ vựng</h2>${renderImagesSection(lessonId)}${sections}${renderQuestions(content.practice, lessonId, '練習 · Luyện tập')}</section>`;
}

function renderGrammar(lessonId, content) {
  const patterns = (Array.isArray(content.patterns) ? content.patterns : []).map((pattern) => `
    <article class="grammar-point">
      <h3 class="grammar-title" lang="ja">${renderGrammarNotation(pattern?.form || '')}</h3>
      ${pattern?.meaningEn ? `<p class="grammar-meaning" lang="en">${escapeHtml(pattern.meaningEn)}</p>` : ''}
      ${pattern?.connection ? `<p class="grammar-formation"><strong>Kết nối:</strong> <span lang="ja">${renderGrammarNotation(pattern.connection)}</span></p>` : ''}
      ${(Array.isArray(pattern?.examples) ? pattern.examples : []).map((example) => `
        <div class="example-box">
          ${renderJapaneseLine(example?.jp || '')}
          ${example?.en ? `<div class="vi-sentence" lang="en">${escapeHtml(example.en)}</div>` : ''}
        </div>`).join('')}
    </article>`).join('');
  return `<section class="content-section grammar-section"><h2 class="section-heading">Ngữ pháp</h2>${patterns}${renderQuestions(content.practice, lessonId, '練習 · Luyện tập')}</section>`;
}

function renderReading(lessonId, content) {
  const passages = (Array.isArray(content.passages) ? content.passages : []).map((passage) => `
    <article class="passage-block">
      ${passage?.heading ? `<h3 class="passage-title" lang="ja">${renderFurigana(passage.heading)}</h3>` : ''}
      ${String(passage?.text || '').split(/\n+/).filter(Boolean).map((line) => renderJapaneseLine(line)).join('')}
    </article>`).join('');
  return `
    <section class="content-section reading-section">
      <h2 class="section-heading">Đọc hiểu</h2>
      ${content.intro ? `<p class="section-intro" lang="ja">${renderFurigana(content.intro)}</p>` : ''}
      ${renderImagesSection(lessonId)}
      ${passages}
      ${renderQuestions(content.questions, lessonId, 'Câu hỏi đọc hiểu')}
    </section>`;
}

function renderListening(lessonId, content) {
  const script = String(content.script || '').split(/\n+/).filter(Boolean).map((line) => renderJapaneseLine(line, 'transcript-line')).join('');
  const audioTracks = Array.isArray(content.audioTracks) ? content.audioTracks : [];
  const introTracks = Array.isArray(content.introTracks) ? content.introTracks : [];
  const coverage = content.audioCoverage && typeof content.audioCoverage === 'object'
    ? content.audioCoverage
    : null;
  const trackMarkup = audioTracks.length
    ? `<div class="lesson-audio-list">${audioTracks.map((track) => `
        <figure class="lesson-audio-track">
          <figcaption>${escapeHtml(track?.label || 'Audio')}</figcaption>
          <audio controls preload="metadata" src="${escapeHtml(track?.src || '')}">Trình duyệt không hỗ trợ phát âm thanh.</audio>
        </figure>`).join('')}</div>`
    : content.audio
      ? `<audio class="lesson-audio" controls preload="metadata" src="${escapeHtml(content.audio)}">Trình duyệt không hỗ trợ phát âm thanh.</audio>`
      : '<p class="text-muted">Bản ghi bài tập của bài này chưa có trong bộ nguồn cục bộ.</p>';
  const coverageMarkup = coverage
    ? `<p class="audio-coverage audio-coverage--${escapeHtml(coverage.status || 'missing')}" role="status">Audio bài tập: ${escapeHtml(coverage.present ?? 0)}/${escapeHtml(coverage.required ?? 0)} track cục bộ${Number(coverage.missing) > 0 ? ` · thiếu ${escapeHtml(coverage.missing)}` : ' · đủ bộ'}.</p>`
    : '';
  const introMarkup = introTracks.length
    ? `<details class="lesson-audio-intros"><summary>Audio giới thiệu chương (${introTracks.length})</summary>${introTracks.map((track) => `
        <figure class="lesson-audio-track">
          <figcaption>${escapeHtml(track?.label || 'Intro')}</figcaption>
          <audio controls preload="metadata" src="${escapeHtml(track?.src || '')}">Trình duyệt không hỗ trợ phát âm thanh.</audio>
        </figure>`).join('')}</details>`
    : '';
  return `
    <section class="content-section listening-section">
      <h2 class="section-heading">Nghe hiểu</h2>
      ${coverageMarkup}${trackMarkup}${introMarkup}
      ${renderImagesSection(lessonId)}
      ${script ? `<div class="transcript-block">${script}</div>` : ''}
      ${renderQuestions(content.questions, lessonId, 'Câu hỏi nghe hiểu')}
    </section>`;
}

function renderBookContent(categoryId, content, lessonId = '') {
  if (!content || typeof content !== 'object') return `
    <div class="lesson-empty-state" role="status">
      <p>Nội dung sách của bài này chưa được trích xuất và xác minh.</p>
      <p class="text-muted">Ứng dụng không tự sáng tác nội dung thay cho sách.</p>
    </div>`;
  if (categoryId === 'kanji') return renderKanji(lessonId, content);
  if (categoryId === 'vocabulary') return renderVocabulary(lessonId, content);
  if (categoryId === 'grammar') return renderGrammar(lessonId, content);
  if (categoryId === 'reading') return renderReading(lessonId, content);
  if (categoryId === 'listening') return renderListening(lessonId, content);
  return '<p class="text-muted">Không có renderer cho danh mục này.</p>';
}

function renderToolbar(done) {
  return `
    <div class="lesson-toolbar">
      <button type="button" class="back-btn" data-action="back">← Quay lại</button>
      <div class="lesson-toolbar-actions">
        <button type="button" class="furigana-toggle-btn" data-action="toggle-furigana" aria-pressed="${getFurigana()}">${getFurigana() ? 'あ' : 'ア'}<span class="sr-only">Furigana</span></button>
        <button type="button" class="complete-toggle-btn${done ? ' is-done' : ''}" data-action="toggle-complete" aria-pressed="${done}">${done ? 'Bỏ đánh dấu' : 'Đánh dấu đã học'}</button>
      </div>
    </div>`;
}

function pageHtml(found, lessonId, content) {
  const { lesson, category, week } = found;
  const unit = category?.id === 'listening' ? 'Chương' : 'Tuần';
  const title = content?.title || lesson.title || '';
  const titleEn = content?.titleEn || lesson.titleEn || '';
  return `
    <article class="lesson-page">
      ${renderToolbar(isDone(lesson.id))}
      <header class="lesson-header">
        <div class="lesson-header-meta">${escapeHtml(category?.name || '')} • ${unit} ${escapeHtml(week?.week ?? '')} • Ngày ${escapeHtml(lesson.day ?? '')}</div>
        <h1 class="lesson-header-title" data-route-heading lang="ja">${renderFurigana(title)}</h1>
        ${titleEn ? `<p class="lesson-title-en" lang="en">${escapeHtml(titleEn)}</p>` : ''}
      </header>
      <div class="lesson-body">${renderBookContent(category?.id, content, lessonId)}</div>
      <div class="lesson-footer-actions">
        <button type="button" class="tutor-lesson-btn" data-action="ask-tutor">🎓 Hỏi gia sư AI</button>
        <button type="button" class="back-btn back-btn-bottom" data-action="back">← Quay lại tổng quan</button>
      </div>
    </article>`;
}

function handleQuiz(button) {
  const container = button.closest('.quiz-question');
  if (!container || container.classList.contains('is-answered')) return;
  if (container.classList.contains('quiz-question-multiblank')) {
    return handleMultiBlankQuiz(container, button);
  }
  container.classList.add('is-answered');
  const correct = Number(container.dataset.correctIdx);
  const selected = Number(button.dataset.idx);
  const options = [...container.querySelectorAll('.quiz-option')];
  options.forEach((option) => {
    option.disabled = true;
    const index = Number(option.dataset.idx);
    if (correct >= 0 && index === correct) option.classList.add('is-correct');
    else if (index === selected) option.classList.add(correct < 0 ? 'is-unverified' : 'is-incorrect');
  });
  const status = container.querySelector('.quiz-explain');
  if (status) {
    status.hidden = false;
    status.textContent = correct >= 0 && options[correct]
      ? `Đáp án: ${options[correct].textContent.trim()}`
      : 'Đáp án của câu này chưa được xác minh.';
  }
}

function handleMultiBlankQuiz(container, button) {
  const blanks = Number(container.dataset.blanks) || 0;
  const answers = JSON.parse(container.dataset.answers || '[]');
  const slots = [...container.querySelectorAll('.quiz-blank-slot')];
  let nextSlot = slots.find((s) => !s.dataset.value);
  container.classList.add('is-answered');
  if (!nextSlot) return;
  const selected = Number(button.dataset.idx);
  nextSlot.dataset.value = String(selected);
  nextSlot.textContent = `${selected + 1}`;
  nextSlot.classList.add('is-filled');
  const filled = slots.map((s) => Number(s.dataset.value));
  if (filled.every((v) => Number.isInteger(v))) {
    const correct = answers.every((a, i) => a === filled[i]);
    const options = [...container.querySelectorAll('.quiz-option')];
    options.forEach((option) => {
      option.disabled = true;
      const index = Number(option.dataset.idx);
      const usedIn = filled.reduce((acc, v, i) => (v === index ? acc.concat(i + 1) : acc), []);
      const isCorrect = answers.includes(index);
      if (usedIn.length) {
        option.classList.add(correct ? 'is-correct' : 'is-incorrect');
        const tag = document.createElement('span');
        tag.className = 'quiz-option-tag';
        tag.textContent = `(${usedIn.join(',')})`;
        option.appendChild(tag);
      }
    });
    const status = container.querySelector('.quiz-explain');
    if (status) {
      status.hidden = false;
      const truth = answers.map((a, i) => `${i + 1}=${a + 1}`).join(' · ');
      status.textContent = correct ? `Đúng! ${truth}` : `Sai. Đáp án: ${truth}`;
    }
  }
}

function lessonContext(found, content) {
  const compact = JSON.stringify(content || {}).slice(0, 10000);
  return {
    lessonId: found.lesson.id,
    category: found.category?.name || found.category?.id || '',
    title: plainJapanese(content?.title || found.lesson.title || ''),
    titleEn: content?.titleEn || found.lesson.titleEn || '',
    content: compact,
  };
}

export function renderLesson(root, id) {
  let popup = null;
  let popupTrigger = null;
  let tutorModal = null;
  let tutorController = null;
  let tutorTrigger = null;

  const closePopup = () => {
    if (!popup) return;
    popup.remove();
    popup = null;
    popupTrigger?.focus?.();
    popupTrigger = null;
  };

  const closeTutorModal = () => {
    if (!tutorModal) return;
    tutorController?.cleanup?.();
    tutorController = null;
    tutorModal.remove();
    tutorModal = null;
    tutorTrigger?.focus?.();
    tutorTrigger = null;
  };

  const onKeyDown = (event) => {
    if (event.key === 'Escape') { closePopup(); closeTutorModal(); }
    else if (event.key === 'Tab' && popup) {
      event.preventDefault();
      popup.querySelector('[data-popup-close]')?.focus();
    }
  };

  const paint = () => {
    const found = findLesson(id);
    if (!found) {
      root.innerHTML = '<div class="lesson-page lesson-not-found"><p role="alert">Không tìm thấy bài học.</p><button type="button" class="back-btn" data-action="back">← Quay lại</button></div>';
      return;
    }
    root.innerHTML = pageHtml(found, id, getBookContent(id));
  };

  // Shared popup lifecycle for both tap-a-word (definition) and tap-a-sentence
  // (translation) explanations — same backdrop/cache/error handling, different prompt.
  const showExplanationPopup = async ({ trigger, titleHtml, cacheKey, buildPrompt }) => {
    closePopup();
    popupTrigger = trigger;
    const cached = getKanjiGloss(cacheKey);
    const dialog = document.createElement('div');
    dialog.className = 'word-popup-backdrop';
    dialog.innerHTML = `
      <section class="word-popup" role="dialog" aria-modal="true" aria-labelledby="word-popup-title">
        <button type="button" class="word-popup-close" data-popup-close aria-label="Đóng giải thích">×</button>
        <h2 id="word-popup-title" lang="ja">${titleHtml}</h2>
        <div class="word-popup-body" role="status" aria-live="polite">${cached ? renderFurigana(cached) : 'Đang hỏi Gemini…'}</div>
      </section>`;
    document.body.appendChild(dialog);
    popup = dialog;
    dialog.querySelector('[data-popup-close]')?.addEventListener('click', closePopup);
    dialog.addEventListener('click', (event) => { if (event.target === dialog) closePopup(); });
    dialog.querySelector('[data-popup-close]')?.focus();
    if (cached) return;

    const epoch = getCurrentRoute().epoch;
    try {
      const result = await askText(buildPrompt());
      if (!isRouteActive('lesson', id, epoch)) return;
      setKanjiGloss(cacheKey, result);
      const body = popup?.querySelector('.word-popup-body');
      if (body) body.innerHTML = renderFurigana(result);
    } catch (error) {
      const body = popup?.querySelector('.word-popup-body');
      if (body) body.textContent = `Không thể tải giải thích: ${error?.message || 'lỗi không xác định'}`;
    }
  };

  const openExplanation = (button) => {
    const word = button.dataset.word || '';
    const reading = button.dataset.reading || '';
    if (!word) return;
    const found = findLesson(id);
    const lessonTitle = plainJapanese(getBookContent(id)?.title || found?.lesson?.title || '');
    const context = button.closest('.kanji-item, .vocab-item, .example-box, .quiz-question, .transcript-line')
      ?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 320) || '';
    return showExplanationPopup({
      trigger: button,
      titleHtml: `${escapeHtml(word)}${reading ? `（${escapeHtml(reading)}）` : ''}`,
      cacheKey: `${id}|word|${word}|${reading}|${context}`,
      buildPrompt: () => ({
        system: 'Bạn là giáo viên tiếng Nhật N2. Trả lời ngắn gọn bằng tiếng Việt, không dùng HTML.',
        user: `Người học vừa bấm vào 「${word}」${reading ? `(${reading})` : ''} trong bài "${lessonTitle}"${context ? `, ngữ cảnh: "${context}"` : ''}. Hãy giải thích ngắn gọn bằng tiếng Việt nghĩa phù hợp ngữ cảnh và cách dùng. Kèm 1 ví dụ ngắn có furigana {漢字|かな}.`,
      }),
    });
  };

  const openSentenceExplanation = (button) => {
    const jp = plainJapanese(button.dataset.jp || '');
    if (!jp) return;
    const found = findLesson(id);
    const lessonTitle = plainJapanese(getBookContent(id)?.title || found?.lesson?.title || '');
    return showExplanationPopup({
      trigger: button,
      titleHtml: 'Dịch sang tiếng Việt',
      cacheKey: `${id}|sentence|${jp}`,
      buildPrompt: () => ({
        system: 'Bạn là giáo viên tiếng Nhật N2. Trả lời ngắn gọn bằng tiếng Việt, không dùng HTML.',
        user: `Người học vừa bấm vào câu tiếng Nhật sau trong bài "${lessonTitle}": "${jp}". Hãy dịch câu này sang tiếng Việt, và nếu có điểm ngữ pháp hoặc từ vựng đáng chú ý thì giải thích thật ngắn gọn.`,
      }),
    });
  };

  const onClick = (event) => {
    const image = event.target.closest('.lesson-image-figure img');
    if (image) {
      if (document.fullscreenElement === image) document.exitFullscreen?.();
      else image.requestFullscreen?.();
      return;
    }
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    if (action === 'back') navigate('#/');
    else if (action === 'toggle-furigana') { setFurigana(!getFurigana()); paint(); }
    else if (action === 'toggle-complete') { toggleDone(id); paint(); }
    else if (action === 'speak') speak(button.dataset.jp || '');
    else if (action === 'quiz-option') handleQuiz(button);
    else if (action === 'explain-word') openExplanation(button);
    else if (action === 'explain-sentence') openSentenceExplanation(button);
    else if (action === 'ask-tutor') openTutorModal(button);
  };

  const openTutorModal = (trigger) => {
    const found = findLesson(id);
    if (!found) return;
    closeTutorModal();
    clearTutorHistory();
    setTutorContext(lessonContext(found, getBookContent(id)));
    tutorTrigger = trigger;
    const dialog = document.createElement('div');
    dialog.className = 'modal-overlay active tutor-modal-overlay';
    dialog.innerHTML = `
      <div class="modal-card tutor-modal-card" role="dialog" aria-modal="true" aria-labelledby="tutor-modal-title">
        <div class="modal-header">
          <h3 id="tutor-modal-title">🎓 Hỏi gia sư AI</h3>
          <button type="button" class="modal-close" data-tutor-modal-close aria-label="Đóng gia sư AI">×</button>
        </div>
        <div class="modal-body tutor-modal-body"></div>
      </div>`;
    document.body.appendChild(dialog);
    tutorModal = dialog;
    dialog.querySelector('[data-tutor-modal-close]')?.addEventListener('click', closeTutorModal);
    dialog.addEventListener('click', (event) => { if (event.target === dialog) closeTutorModal(); });
    tutorController = renderTutor(dialog.querySelector('.tutor-modal-body'));
  };

  root.addEventListener('click', onClick);
  document.addEventListener('keydown', onKeyDown);
  paint();

  return {
    cleanup() {
      root.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKeyDown);
      closePopup();
      closeTutorModal();
      if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
    },
  };
}
