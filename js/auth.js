// js/auth.js
// First-visit sign-in gate: "Đăng nhập bằng Google" or "Bỏ qua, dùng offline".
// Google is the only sign-in method — see js/supabase.js. Mirrors the
// modal/dialog conventions already used by js/profile.js (focus trap,
// Escape/backdrop close, aria-live status line).

import { signInWithGoogle } from './supabase.js';

let activeDialog = null;
let dialogSequence = 0;

function focusableElements(container) {
  return Array.from(container.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )).filter((element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true');
}

/**
 * Open the sign-in gate. `options.onSkip` fires when the user dismisses the
 * gate in any way (Bỏ qua, Escape, or backdrop click) — the caller decides
 * what "skip" means (e.g. fall through to the offline name/avatar prompt).
 * Returns `{ close() }`, or the already-open controller if one is active.
 */
export function openSignInGate(options = {}) {
  if (typeof document === 'undefined') return null;
  if (activeDialog) return activeDialog;

  const trigger = options.trigger instanceof HTMLElement ? options.trigger : document.activeElement;
  const sequence = ++dialogSequence;
  const titleId = `signin-gate-title-${sequence}`;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay auth-modal active';
  overlay.innerHTML = `
    <section class="modal-card auth-modal__card" role="dialog" aria-modal="true" aria-labelledby="${titleId}">
      <header class="modal-header">
        <h2 id="${titleId}">Lưu tiến độ &amp; thi đua cùng bạn bè</h2>
        <button type="button" class="modal-close" data-gate-action="skip" aria-label="Bỏ qua, dùng offline">×</button>
      </header>
      <div class="modal-body">
        <p class="profile-modal__help">Đăng nhập để tiến độ, streak và điểm được lưu trên máy chủ và hiện trên bảng xếp hạng cùng bạn bè. Bỏ qua thì vẫn học được như bình thường, chỉ lưu trên máy này.</p>
        <button type="button" class="auth-pill auth-modal__google" data-gate-action="google">Đăng nhập bằng Google</button>
        <p class="profile-status" data-gate-status role="status" aria-live="polite"></p>
      </div>
      <footer class="modal-footer auth-modal__footer">
        <button type="button" class="auth-modal__link-btn" data-gate-action="skip">Bỏ qua, dùng offline</button>
      </footer>
    </section>`;

  document.body.appendChild(overlay);
  const backgroundState = Array.from(document.body.children)
    .filter((element) => element !== overlay && element instanceof HTMLElement)
    .map((element) => ({
      element,
      inert: Boolean(element.inert),
      ariaHidden: element.getAttribute('aria-hidden'),
    }));
  backgroundState.forEach(({ element }) => {
    element.inert = true;
    element.setAttribute('aria-hidden', 'true');
  });

  const card = overlay.querySelector('[role="dialog"]');
  const status = overlay.querySelector('[data-gate-status]');
  const googleBtn = overlay.querySelector('[data-gate-action="google"]');
  let closed = false;

  function setStatus(message, kind = '') {
    status.textContent = message;
    status.classList.toggle('is-error', kind === 'error');
  }

  function closeDialog() {
    if (closed) return;
    closed = true;
    overlay.removeEventListener('keydown', onKeyDown);
    backgroundState.forEach(({ element, inert, ariaHidden }) => {
      element.inert = inert;
      if (ariaHidden === null) element.removeAttribute('aria-hidden');
      else element.setAttribute('aria-hidden', ariaHidden);
    });
    overlay.remove();
    activeDialog = null;
    if (trigger && typeof trigger.focus === 'function' && trigger.isConnected) trigger.focus();
  }

  function skip() {
    closeDialog();
    if (typeof options.onSkip === 'function') options.onSkip();
  }

  function onKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      skip();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = focusableElements(card);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  overlay.addEventListener('keydown', onKeyDown);
  overlay.addEventListener('click', (event) => {
    const action = event.target.closest('[data-gate-action]')?.getAttribute('data-gate-action');
    if (action === 'skip') skip();
    if (event.target === overlay) skip();
  });

  googleBtn.addEventListener('click', async () => {
    googleBtn.disabled = true;
    setStatus('Đang chuyển tới Google…');
    try {
      await signInWithGoogle();
      // Browser navigates away on success; nothing else to do here.
    } catch (error) {
      if (!closed) {
        setStatus(error instanceof Error ? error.message : 'Không thể mở đăng nhập Google.', 'error');
        googleBtn.disabled = false;
      }
    }
  });

  activeDialog = { close: skip, element: overlay };
  window.setTimeout(() => googleBtn?.focus(), 0);
  return activeDialog;
}
