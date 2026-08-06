// js/pet.js
// Inline chibi streak companion. Preferences are stored inside the existing
// settings object so changing the pet never overwrites unrelated settings.

import { getSettings, setSettings } from './store.js';

export const PET_UPDATED_EVENT = 'n2:pet-updated';
export const PET_COMPLETION_EVENT = 'n2:lesson-complete';

export const PET_TYPES = Object.freeze([
  Object.freeze({ id: 'cat', label: 'Mèo', sound: 'Meo!' }),
  Object.freeze({ id: 'dog', label: 'Cún', sound: 'Gâu!' }),
  Object.freeze({ id: 'dragon', label: 'Rồng con', sound: 'Gừ~!' }),
]);

export const PET_ACCESSORIES = Object.freeze([
  Object.freeze({ id: 'scarf', label: 'Khăn quàng' }),
  Object.freeze({ id: 'beanie', label: 'Mũ len' }),
  Object.freeze({ id: 'none', label: 'Không phụ kiện' }),
]);

const DEFAULT_PET = Object.freeze({ petType: 'cat', petAccessory: 'scarf' });
let petSequence = 0;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[character]));
}

function lookup(items, id) {
  return items.find((item) => item.id === id) || items[0];
}

function safeStreak(value) {
  const streak = Number(value);
  return Number.isFinite(streak) ? Math.max(0, Math.floor(streak)) : 0;
}

export function getPetPreferences(settings = getSettings()) {
  const source = settings && typeof settings === 'object' ? settings : {};
  return {
    petType: lookup(PET_TYPES, source.petType || DEFAULT_PET.petType).id,
    petAccessory: lookup(PET_ACCESSORIES, source.petAccessory || DEFAULT_PET.petAccessory).id,
  };
}

export function setPetPreferences(patch) {
  const current = getPetPreferences();
  const source = patch && typeof patch === 'object' ? patch : {};
  const next = {
    petType: lookup(PET_TYPES, source.petType || current.petType).id,
    petAccessory: lookup(PET_ACCESSORIES, source.petAccessory || current.petAccessory).id,
  };
  setSettings(next);

  if (typeof window !== 'undefined' && typeof CustomEvent === 'function') {
    window.dispatchEvent(new CustomEvent(PET_UPDATED_EVENT, { detail: { ...next } }));
  }
  return next;
}

/** Stable streak tiers used by both SVG expression and dashboard copy. */
export function getPetTier(streakValue) {
  const streak = safeStreak(streakValue);
  if (streak === 0) {
    return {
      id: 'sleeping',
      min: 0,
      label: 'Đang chờ bạn',
      message: 'Hoàn thành một bài để đánh thức bạn nhỏ nhé.',
    };
  }
  if (streak <= 2) {
    return {
      id: 'waking',
      min: 1,
      label: 'Vừa thức giấc',
      message: `${streak} ngày liên tiếp — khởi đầu thật ấm áp.`,
    };
  }
  if (streak <= 6) {
    return {
      id: 'happy',
      min: 3,
      label: 'Rất vui vẻ',
      message: `${streak} ngày liên tiếp — bạn nhỏ đang lớn lên cùng bạn.`,
    };
  }
  if (streak <= 13) {
    return {
      id: 'excited',
      min: 7,
      label: 'Rực rỡ',
      message: `${streak} ngày liên tiếp — cả hai đang vào guồng rồi!`,
    };
  }
  return {
    id: 'legendary',
    min: 14,
    label: 'Huyền thoại',
    message: `${streak} ngày liên tiếp — một chuỗi học đáng tự hào.`,
  };
}

function earMarkup(type) {
  if (type === 'dog') {
    return `
      <path class="pet-svg__ear pet-svg__ear--left" d="M66 116C42 104 34 130 47 161c7 16 22 12 30-3z"/>
      <path class="pet-svg__ear pet-svg__ear--right" d="M174 116c24-12 32 14 19 45-7 16-22 12-30-3z"/>`;
  }
  if (type === 'dragon') {
    return `
      <path class="pet-svg__horn" d="M76 105 61 66l35 31zm88 0 15-39-35 31z"/>
      <path class="pet-svg__ear pet-svg__ear--left" d="m77 109-32-20 14 42z"/>
      <path class="pet-svg__ear pet-svg__ear--right" d="m163 109 32-20-14 42z"/>`;
  }
  return `
    <path class="pet-svg__ear pet-svg__ear--left" d="m77 111-18-49 46 36z"/>
    <path class="pet-svg__ear pet-svg__ear--right" d="m163 111 18-49-46 36z"/>
    <path class="pet-svg__ear-inner" d="m78 98-11-24 27 21zm84 0 11-24-27 21z"/>`;
}

function tailAndExtrasMarkup(type) {
  if (type === 'dog') {
    return `<path class="pet-svg__tail pet-svg__tail--dog" d="M174 255c31-23 43 9 14 22"/>`;
  }
  if (type === 'dragon') {
    return `
      <path class="pet-svg__wing pet-svg__wing--left" d="M78 214 38 183l9 48-20 10 51 26z"/>
      <path class="pet-svg__wing pet-svg__wing--right" d="m162 214 40-31-9 48 20 10-51 26z"/>
      <path class="pet-svg__tail pet-svg__tail--dragon" d="M171 258c50 19 21 62-4 35"/>
      <path class="pet-svg__tail-tip" d="m192 293 23-2-13 19z"/>`;
  }
  return `<path class="pet-svg__tail pet-svg__tail--cat" d="M172 259c49 1 48-57 15-46"/>`;
}

function eyeMarkup(tierId) {
  if (tierId === 'sleeping') {
    return `
      <path class="pet-svg__eye-closed" d="M86 151q12 12 24 0M130 151q12 12 24 0"/>
      <path class="pet-svg__mouth" d="M112 177q8-5 16 0"/>`;
  }
  if (tierId === 'waking') {
    return `
      <ellipse class="pet-svg__eye" cx="98" cy="151" rx="10" ry="14"/>
      <circle class="pet-svg__eye-shine" cx="94" cy="146" r="3"/>
      <path class="pet-svg__eye-closed" d="M130 151q12 12 24 0"/>
      <path class="pet-svg__mouth" d="M113 176q7 7 14 0"/>`;
  }
  return `
    <ellipse class="pet-svg__eye" cx="98" cy="151" rx="12" ry="16"/>
    <ellipse class="pet-svg__eye" cx="142" cy="151" rx="12" ry="16"/>
    <circle class="pet-svg__eye-shine" cx="93" cy="145" r="4"/>
    <circle class="pet-svg__eye-shine" cx="137" cy="145" r="4"/>
    <circle class="pet-svg__eye-shine pet-svg__eye-shine--small" cx="103" cy="155" r="2"/>
    <circle class="pet-svg__eye-shine pet-svg__eye-shine--small" cx="147" cy="155" r="2"/>
    <path class="pet-svg__mouth" d="M109 176q11 15 22 0"/>`;
}

function faceExtrasMarkup(type) {
  if (type === 'cat') {
    return `
      <path class="pet-svg__whisker" d="m88 171-31-8m32 17-30 4m93-13 31-8m-32 17 30 4"/>
      <path class="pet-svg__nose" d="m115 168 5 4 5-4z"/>`;
  }
  if (type === 'dog') {
    return `
      <ellipse class="pet-svg__muzzle" cx="120" cy="174" rx="24" ry="18"/>
      <path class="pet-svg__nose" d="M111 165q9-7 18 0l-9 9z"/>`;
  }
  return `
    <ellipse class="pet-svg__muzzle" cx="120" cy="174" rx="25" ry="17"/>
    <circle class="pet-svg__nostril" cx="111" cy="172" r="2"/>
    <circle class="pet-svg__nostril" cx="129" cy="172" r="2"/>
    <path class="pet-svg__cheek-scale" d="m81 172-9 7 11 4m76-11 9 7-11 4"/>`;
}

function accessoryMarkup(accessory) {
  if (accessory === 'beanie') {
    return `
      <g class="pet-svg__accessory pet-svg__beanie">
        <path d="M73 119c4-43 90-43 94 0z"/>
        <path d="M67 116h106v18H67z"/>
        <circle cx="120" cy="77" r="12"/>
      </g>`;
  }
  if (accessory === 'scarf') {
    return `
      <g class="pet-svg__accessory pet-svg__scarf">
        <path d="M77 205q43 25 86 0l-4 25q-39 19-78 0z"/>
        <path d="m139 224 25 8-11 60-23-9z"/>
      </g>`;
  }
  return '';
}

function tierDecorationMarkup(tierId) {
  const sleeping = tierId === 'sleeping'
    ? `<g class="pet-svg__sleep"><text x="172" y="102">z</text><text x="190" y="82">z</text></g>`
    : '';
  const sparkle = tierId === 'excited' || tierId === 'legendary'
    ? `<g class="pet-svg__sparkles"><path d="m45 142 5 11 11 5-11 5-5 11-5-11-11-5 11-5zm154 30 4 9 9 4-9 4-4 9-4-9-9-4 9-4z"/></g>`
    : '';
  const crown = tierId === 'legendary'
    ? `<g class="pet-svg__crown"><path d="m86 91-8-34 26 18 16-29 16 29 26-18-8 34z"/><path d="M86 91h68v12H86z"/></g>`
    : '';
  return sleeping + sparkle + crown;
}

/**
 * Render one self-contained SVG. All dynamic values are normalized to fixed
 * allow-lists before reaching markup.
 */
export function renderPet(options = {}) {
  const preferences = {
    petType: lookup(PET_TYPES, options.type || options.petType || DEFAULT_PET.petType).id,
    petAccessory: lookup(PET_ACCESSORIES, options.accessory || options.petAccessory || DEFAULT_PET.petAccessory).id,
  };
  const streak = safeStreak(options.streak);
  const tier = getPetTier(streak);
  const type = lookup(PET_TYPES, preferences.petType);
  const accessory = lookup(PET_ACCESSORIES, preferences.petAccessory);
  const sequence = ++petSequence;
  const titleId = `pet-title-${sequence}`;
  const descriptionId = `pet-description-${sequence}`;
  const label = `${type.label} ${tier.label.toLocaleLowerCase('vi-VN')}`;
  const decorative = options.decorative === true;
  const accessibility = decorative
    ? 'aria-hidden="true" focusable="false"'
    : `role="img" aria-labelledby="${titleId} ${descriptionId}"`;
  const accessibleText = decorative
    ? ''
    : `<title id="${titleId}">${escapeHtml(label)}</title><desc id="${descriptionId}">${escapeHtml(tier.message)} Phụ kiện: ${escapeHtml(accessory.label)}.</desc>`;

  return `
    <svg class="streak-pet pet--${type.id} pet--tier-${tier.id}" viewBox="0 0 240 360" ${accessibility} xmlns="http://www.w3.org/2000/svg">
      ${accessibleText}
      <g class="pet-svg__aura"><ellipse cx="120" cy="309" rx="82" ry="18"/><circle cx="120" cy="173" r="105"/></g>
      <g class="pet-svg__character">
        ${tailAndExtrasMarkup(type.id)}
        <ellipse class="pet-svg__body" cx="120" cy="256" rx="57" ry="68"/>
        <path class="pet-svg__belly" d="M88 251c0-38 64-38 64 0v37c0 31-64 31-64 0z"/>
        <path class="pet-svg__paw pet-svg__paw--left" d="M80 239q-34 17-18 41 16 12 33-13"/>
        <path class="pet-svg__paw pet-svg__paw--right" d="M160 239q34 17 18 41-16 12-33-13"/>
        <ellipse class="pet-svg__foot pet-svg__foot--left" cx="91" cy="316" rx="27" ry="15"/>
        <ellipse class="pet-svg__foot pet-svg__foot--right" cx="149" cy="316" rx="27" ry="15"/>
        ${earMarkup(type.id)}
        <circle class="pet-svg__head" cx="120" cy="155" r="69"/>
        <ellipse class="pet-svg__cheek pet-svg__cheek--left" cx="82" cy="177" rx="13" ry="8"/>
        <ellipse class="pet-svg__cheek pet-svg__cheek--right" cx="158" cy="177" rx="13" ry="8"/>
        ${eyeMarkup(tier.id)}
        ${faceExtrasMarkup(type.id)}
        ${accessoryMarkup(preferences.petAccessory)}
        ${tierDecorationMarkup(tier.id)}
      </g>
    </svg>`;
}

function resolveTarget(target) {
  if (typeof target === 'string') return document.querySelector(target);
  return target instanceof Element ? target : null;
}

function selectOptions(items, selected) {
  return items.map((item) => (
    `<option value="${escapeHtml(item.id)}"${item.id === selected ? ' selected' : ''}>${escapeHtml(item.label)}</option>`
  )).join('');
}

function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function reactionCopy(kind, type) {
  if (kind === 'complete') return `${type.sound} Tuyệt lắm — thêm một bài đã hoàn thành!`;
  if (kind === 'tier-up') return `${type.sound} Chuỗi học vừa lên một cấp mới!`;
  return `${type.sound} Mình học tiếp cùng nhau nhé!`;
}

/** Broadcast a completion so any currently mounted dashboard pet can react. */
export function announceLessonCompleted(detail = {}) {
  if (typeof window === 'undefined' || typeof CustomEvent !== 'function') return;
  window.dispatchEvent(new CustomEvent(PET_COMPLETION_EVENT, {
    detail: detail && typeof detail === 'object' ? { ...detail } : {},
  }));
}

/**
 * Mount the dashboard pet and optional accessible selectors. Returns a controller
 * with update/react/destroy methods for dashboard and lesson-completion wiring.
 */
export function mountPet(target, options = {}) {
  if (typeof document === 'undefined') return null;
  const host = resolveTarget(target);
  if (!host) return null;

  const sequence = ++petSequence;
  const mount = document.createElement('div');
  mount.className = 'streak-pet-mount';
  mount.dataset.petMount = String(sequence);
  host.appendChild(mount);

  let streak = safeStreak(options.streak);
  let preferences = getPetPreferences();
  let reactionTimer = null;
  let destroyed = false;

  const headingId = `pet-card-heading-${sequence}`;
  const statusId = `pet-card-status-${sequence}`;
  const typeId = `pet-type-${sequence}`;
  const accessoryId = `pet-accessory-${sequence}`;

  function render() {
    if (destroyed) return;
    const controlsWereOpen = Boolean(mount.querySelector('.streak-pet-customizer')?.open);
    const activeSetting = mount.contains(document.activeElement)
      ? document.activeElement?.dataset?.petSetting || ''
      : '';
    const tier = getPetTier(streak);
    const type = lookup(PET_TYPES, preferences.petType);
    const showControls = options.showControls !== false;
    mount.innerHTML = `
      <section class="streak-pet-card" aria-labelledby="${headingId}">
        <div class="streak-pet-card__copy">
          <p class="streak-pet-card__eyebrow">BẠN ĐỒNG HÀNH · ${streak} NGÀY</p>
          <h3 id="${headingId}">${escapeHtml(tier.label)}</h3>
          <p class="streak-pet-card__message">${escapeHtml(tier.message)}</p>
        </div>
        <button type="button" class="streak-pet-button" aria-label="Chơi với ${escapeHtml(type.label)}" aria-describedby="${statusId}">
          <span class="streak-pet-stage">${renderPet({ ...preferences, streak, decorative: true })}</span>
        </button>
        <p id="${statusId}" class="streak-pet-status" role="status" aria-live="polite"></p>
        ${showControls ? `
          <details class="streak-pet-customizer">
            <summary>Tùy chỉnh bạn đồng hành</summary>
            <div class="streak-pet-customizer__fields">
              <label for="${typeId}">Bạn đồng hành
                <select id="${typeId}" data-pet-setting="petType">${selectOptions(PET_TYPES, preferences.petType)}</select>
              </label>
              <label for="${accessoryId}">Phụ kiện
                <select id="${accessoryId}" data-pet-setting="petAccessory">${selectOptions(PET_ACCESSORIES, preferences.petAccessory)}</select>
              </label>
            </div>
          </details>` : ''}
      </section>`;
    const customizer = mount.querySelector('.streak-pet-customizer');
    if (customizer && controlsWereOpen) customizer.open = true;
    if (activeSetting) {
      mount.querySelector(`[data-pet-setting="${activeSetting}"]`)?.focus();
    }
  }

  function react(kind = 'play') {
    if (destroyed) return;
    const type = lookup(PET_TYPES, preferences.petType);
    const stage = mount.querySelector('.streak-pet-stage');
    const status = mount.querySelector('.streak-pet-status');
    if (status) status.textContent = reactionCopy(kind, type);

    if (reactionTimer) window.clearTimeout(reactionTimer);
    if (stage && !prefersReducedMotion()) {
      stage.classList.remove('is-reacting', 'is-celebrating');
      // Force a new animation only after an explicit user/completion event.
      void stage.offsetWidth;
      stage.classList.add(kind === 'complete' || kind === 'tier-up' ? 'is-celebrating' : 'is-reacting');
      reactionTimer = window.setTimeout(() => {
        stage.classList.remove('is-reacting', 'is-celebrating');
        reactionTimer = null;
      }, 1400);
    }
    if (typeof options.onReact === 'function') options.onReact(kind);
  }

  function onClick(event) {
    if (event.target.closest('.streak-pet-button')) react('play');
  }

  function onChange(event) {
    const select = event.target.closest('[data-pet-setting]');
    if (!select) return;
    preferences = setPetPreferences({ [select.dataset.petSetting]: select.value });
    if (typeof options.onChange === 'function') options.onChange({ ...preferences });
  }

  function onPreferencesUpdated(event) {
    preferences = getPetPreferences(event.detail);
    render();
  }

  function onLessonCompleted(event) {
    if (event.detail?.done === false) return;
    const incomingStreak = event.detail?.streak;
    if (incomingStreak != null) streak = safeStreak(incomingStreak);
    render();
    react('complete');
  }

  mount.addEventListener('click', onClick);
  mount.addEventListener('change', onChange);
  window.addEventListener(PET_UPDATED_EVENT, onPreferencesUpdated);
  window.addEventListener(PET_COMPLETION_EVENT, onLessonCompleted);
  render();

  return {
    element: mount,
    react,
    update(next = {}) {
      if (Object.prototype.hasOwnProperty.call(next, 'streak')) streak = safeStreak(next.streak);
      if (next.petType || next.petAccessory) {
        preferences = {
          petType: lookup(PET_TYPES, next.petType || preferences.petType).id,
          petAccessory: lookup(PET_ACCESSORIES, next.petAccessory || preferences.petAccessory).id,
        };
      }
      render();
    },
    destroy() {
      destroyed = true;
      if (reactionTimer) window.clearTimeout(reactionTimer);
      mount.removeEventListener('click', onClick);
      mount.removeEventListener('change', onChange);
      window.removeEventListener(PET_UPDATED_EVENT, onPreferencesUpdated);
      window.removeEventListener(PET_COMPLETION_EVENT, onLessonCompleted);
      mount.remove();
    },
  };
}
