// js/router.js
// Minimal hash router.
//   ``, `#`, `#/`      -> routes.dashboard(rootEl)
//   `#/lesson/<id>`    -> routes.lesson(rootEl, id)
//   `#/tutor`          -> routes.tutor(rootEl)
//   `#/voice`          -> routes.voice(rootEl)
// After every render: sync `.nav-btn.active` to `data-route`, scroll #app to top.

let _routes = null;
let _rootEl = null;

function parseHash(hash) {
  const raw = String(hash || '').replace(/^#/, '');
  const parts = raw.split('/').filter(Boolean); // '' | '/' -> []

  if (parts.length === 0) return { name: 'dashboard', params: [] };
  if (parts[0] === 'lesson' && parts[1]) return { name: 'lesson', params: [parts[1]] };
  if (parts[0] === 'tutor') return { name: 'tutor', params: [] };
  if (parts[0] === 'voice') return { name: 'voice', params: [] };
  return { name: 'dashboard', params: [] };
}

function updateActiveNav(routeName) {
  try {
    document.querySelectorAll('.nav-btn').forEach((btn) => {
      const route = btn.getAttribute('data-route');
      btn.classList.toggle('active', route === routeName);
    });
  } catch (err) {
    // No DOM / no nav present — ignore.
  }
}

function scrollAppToTop() {
  try {
    const app = _rootEl || document.getElementById('app');
    if (app) {
      if (typeof app.scrollTo === 'function') app.scrollTo(0, 0);
      app.scrollTop = 0;
    }
    window.scrollTo(0, 0);
  } catch (err) {
    // ignore
  }
}

function render() {
  if (!_routes || !_rootEl) return;
  const { name, params } = parseHash(location.hash);

  try {
    if (name === 'lesson' && typeof _routes.lesson === 'function') {
      _routes.lesson(_rootEl, params[0]);
    } else if (name === 'tutor' && typeof _routes.tutor === 'function') {
      _routes.tutor(_rootEl);
    } else if (name === 'voice' && typeof _routes.voice === 'function') {
      _routes.voice(_rootEl);
    } else if (typeof _routes.dashboard === 'function') {
      _routes.dashboard(_rootEl);
    }
  } catch (err) {
    console.error('[router] failed to render route:', name, err);
  }

  updateActiveNav(name);
  scrollAppToTop();
}

/**
 * @param {{dashboard:Function, lesson:Function, tutor:Function, voice:Function}} routes
 * @param {HTMLElement} rootEl
 */
export function initRouter(routes, rootEl) {
  _routes = routes || {};
  _rootEl = rootEl || document.getElementById('app');
  window.addEventListener('hashchange', render);
  render();
}

/**
 * Navigate to a hash route, e.g. navigate('#/lesson/g1d1').
 * @param {string} hash
 */
export function navigate(hash) {
  try {
    const target = String(hash || '#/');
    const normalized = target.startsWith('#') ? target : `#${target}`;
    if (location.hash === normalized) {
      render();
    } else {
      location.hash = normalized;
    }
  } catch (err) {
    // ignore
  }
}
