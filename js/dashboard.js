// js/dashboard.js — dashboard list + stats + streak (ported from original index.html)
import { getLessons, countProgress, isDone, toggleDone, getStreak } from './store.js';
import { renderFurigana } from './furigana.js';
import { navigate } from './router.js';

// Remembers the active category filter across re-renders within the session.
let activeCategory = 'all';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

/**
 * Renders the dashboard (stats bar, category tabs, week cards with lessons) into rootEl.
 * @param {HTMLElement} root
 */
export function renderDashboard(root) {
  const data = getLessons();

  if (!data || !Array.isArray(data.categories)) {
    root.innerHTML = `
      <p class="dash-empty-state">
        Không tải được dữ liệu bài học.
      </p>`;
    return;
  }

  // Reset filter to "all" if the remembered category no longer exists in the dataset.
  if (activeCategory !== 'all' && !data.categories.some((cat) => cat.id === activeCategory)) {
    activeCategory = 'all';
  }

  root.innerHTML = `
    <section class="stats-bar" id="dash-stats"></section>
    <div class="category-tabs" id="category-tabs"></div>
    <main id="dash-main"></main>
  `;

  renderStats();
  renderTabs(data);
  renderCategories(data);
  bindEvents(data);
}

function renderStats() {
  const statsEl = document.getElementById('dash-stats');
  if (!statsEl) return;

  const progress = countProgress() || { total: 0, done: 0 };
  const total = Number(progress.total) || 0;
  const done = Number(progress.done) || 0;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  const streakInfo = getStreak() || { streak: 0 };
  const streak = Number(streakInfo.streak) || 0;

  statsEl.innerHTML = `
    <div class="stat-item">
      <div class="stat-value">${done} / ${total}</div>
      <div class="stat-label">Bài học xong</div>
      <div class="progress-bar-container">
        <div class="progress-bar-fill" style="width:${percent}%"></div>
      </div>
    </div>
    <div class="stat-item">
      <div class="stat-value">${percent}%</div>
      <div class="stat-label">Hoàn thành</div>
    </div>
    <div class="stat-item">
      <div class="stat-value">${streak} Ngày</div>
      <div class="stat-label">Chuỗi học</div>
    </div>
  `;
}

function renderTabs(data) {
  const tabsEl = document.getElementById('category-tabs');
  if (!tabsEl) return;

  const cats = data.categories || [];
  const allTab = `<button type="button" class="tab-btn${activeCategory === 'all' ? ' active' : ''}" data-cat="all">Tất cả</button>`;
  const catTabs = cats
    .map((cat) => {
      const isActive = activeCategory === cat.id;
      return `<button type="button" class="tab-btn${isActive ? ' active' : ''}" data-cat="${escapeHtml(cat.id)}">${escapeHtml(cat.name)}</button>`;
    })
    .join('');

  tabsEl.innerHTML = allTab + catTabs;
}

function renderCategories(data) {
  const mainEl = document.getElementById('dash-main');
  if (!mainEl) return;

  const cats = (data.categories || []).filter(
    (cat) => activeCategory === 'all' || cat.id === activeCategory
  );

  if (cats.length === 0) {
    mainEl.innerHTML = `
      <p class="dash-empty-state">
        Không có bài học nào.
      </p>`;
    return;
  }

  mainEl.innerHTML = cats.map((cat) => renderCategoryBlock(cat)).join('');
}

function renderCategoryBlock(cat) {
  const weeks = Array.isArray(cat.weeks) ? cat.weeks : [];
  let catTotal = 0;
  let catDone = 0;
  weeks.forEach((week) => {
    (week.lessons || []).forEach((lesson) => {
      catTotal += 1;
      if (isDone(lesson.id)) catDone += 1;
    });
  });

  const nameEn = cat.nameEn ? ` (${escapeHtml(cat.nameEn)})` : '';

  return `
    <div class="category-block" data-cat-id="${escapeHtml(cat.id)}">
      <div class="category-header">
        <h3>${escapeHtml(cat.name)}${nameEn}</h3>
        <span class="category-progress-text">${catDone}/${catTotal} Xong</span>
      </div>
      <div class="weeks-container">
        ${weeks.map((week) => renderWeekCard(week)).join('')}
      </div>
    </div>
  `;
}

function renderWeekCard(week) {
  const lessons = Array.isArray(week.lessons) ? week.lessons : [];
  const doneCount = lessons.filter((lesson) => isDone(lesson.id)).length;

  return `
    <div class="week-card">
      <div class="week-title">
        <span>Tuần ${escapeHtml(week.week)}</span>
        <span class="week-count">${doneCount}/${lessons.length}</span>
      </div>
      <div class="lessons-grid">
        ${lessons.map((lesson) => renderLessonItem(lesson)).join('')}
      </div>
    </div>
  `;
}

function renderLessonItem(lesson) {
  const done = isDone(lesson.id);
  const typeLabel = lesson.type === 'practice' ? 'Thực chiến' : 'Bài học';

  return `
    <div class="lesson-item${done ? ' completed' : ''}" data-id="${escapeHtml(lesson.id)}">
      <div class="custom-checkbox" aria-hidden="true"></div>
      <div class="lesson-content">
        <div class="lesson-meta">Ngày ${escapeHtml(lesson.day)} • ${typeLabel}</div>
        <div class="lesson-title">${renderFurigana(lesson.title || '')}</div>
      </div>
      <button type="button" class="study-btn">Học</button>
    </div>
  `;
}

/** Recomputes the week/category progress counters that wrap a toggled lesson item. */
function updateAncestorCounts(item) {
  const weekCard = item.closest('.week-card');
  if (weekCard) {
    const weekItems = weekCard.querySelectorAll('.lesson-item');
    const weekDone = weekCard.querySelectorAll('.lesson-item.completed').length;
    const weekCountEl = weekCard.querySelector('.week-count');
    if (weekCountEl) weekCountEl.textContent = `${weekDone}/${weekItems.length}`;
  }

  const catBlock = item.closest('.category-block');
  if (catBlock) {
    const catItems = catBlock.querySelectorAll('.lesson-item');
    const catDone = catBlock.querySelectorAll('.lesson-item.completed').length;
    const catCountEl = catBlock.querySelector('.category-progress-text');
    if (catCountEl) catCountEl.textContent = `${catDone}/${catItems.length} Xong`;
  }
}

function bindEvents(data) {
  const tabsEl = document.getElementById('category-tabs');
  const mainEl = document.getElementById('dash-main');

  if (tabsEl) {
    tabsEl.addEventListener('click', (event) => {
      const btn = event.target.closest('.tab-btn');
      if (!btn) return;

      const cat = btn.getAttribute('data-cat');
      if (!cat || cat === activeCategory) return;

      activeCategory = cat;
      tabsEl.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b === btn));
      renderCategories(data);
    });
  }

  if (mainEl) {
    mainEl.addEventListener('click', (event) => {
      const item = event.target.closest('.lesson-item');
      if (!item) return;

      const id = item.getAttribute('data-id');
      if (!id) return;

      const studyBtn = event.target.closest('.study-btn');
      if (studyBtn) {
        event.stopPropagation();
        navigate(`#/lesson/${encodeURIComponent(id)}`);
        return;
      }

      const nowDone = toggleDone(id);
      item.classList.toggle('completed', nowDone);
      updateAncestorCounts(item);
      renderStats();
    });
  }
}
