// js/app.js — application bootstrap
// Loads lesson data, wires the header/nav controls, and starts the hash router.

import { setLessons, resetBookContent, mergeBookContent, setTutorContext } from './store.js';
import { initRouter, navigate } from './router.js';
import { initFuriganaToggle } from './furigana.js';
import { openSettings } from './gemini.js';
import { renderDashboard } from './dashboard.js';
import { renderLesson } from './lesson.js';
import { renderTutor } from './tutor.js';
import { renderVoice } from './voice.js';
import { mountProfile } from './profile.js';

function setCurrentDate() {
    const el = document.getElementById('current-date');
    if (!el) return;
    try {
        const formatted = new Date().toLocaleDateString('vi-VN', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
        });
        el.textContent = formatted.toUpperCase();
    } catch (err) {
        // Non-fatal: leave the date blank if Intl/date formatting fails.
    }
}

function wireSettingsButton() {
    const btn = document.getElementById('btn-settings');
    if (!btn) return;
    btn.addEventListener('click', () => {
        openSettings();
    });
}

function wireBottomNav() {
    const buttons = document.querySelectorAll('.bottom-nav .nav-btn');
    buttons.forEach((btn) => {
        btn.addEventListener('click', () => {
            const route = btn.getAttribute('data-route');
            if (route === 'dashboard') navigate('#/');
            else if (route === 'tutor') {
                setTutorContext(null);
                navigate('#/tutor');
            }
            else if (route === 'voice') navigate('#/voice');
        });
    });
}

async function loadLessons() {
    try {
        const res = await fetch('data/lessons.json');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setLessons(data);
    } catch (err) {
        console.error('Không thể nạp data/lessons.json:', err);
        setLessons(null);
    }
}

async function loadBookContent() {
    resetBookContent();
    try {
        const manifestResponse = await fetch('data/book/manifest.json');
        if (!manifestResponse.ok) throw new Error(`HTTP ${manifestResponse.status}`);
        const manifest = await manifestResponse.json();
        const files = Array.isArray(manifest.files)
            ? manifest.files
            : Object.values(manifest.categories || {}).map((entry) => entry && entry.file).filter(Boolean);
        const payloads = await Promise.all(files.map(async (file) => {
            const response = await fetch(`data/book/${encodeURIComponent(file)}`);
            if (!response.ok) throw new Error(`${file}: HTTP ${response.status}`);
            return response.json();
        }));
        payloads.forEach(mergeBookContent);
    } catch (err) {
        // The checked-in W1 proof remains a useful development fallback while a
        // manifest is being regenerated, but production uses manifest.json only.
        try {
            const response = await fetch('data/book/kanji-w1.json');
            if (response.ok) mergeBookContent(await response.json());
        } catch (fallbackErr) {
            console.warn('Không thể nạp dữ liệu sách:', err);
        }
    }
}

async function bootstrap() {
    setCurrentDate();
    initFuriganaToggle();
    wireSettingsButton();
    wireBottomNav();
    mountProfile('#profile-mount', { promptOnFirstVisit: true });

    await Promise.all([loadLessons(), loadBookContent()]);

    const rootEl = document.getElementById('app');
    initRouter(
        {
            dashboard: renderDashboard,
            lesson: renderLesson,
            tutor: renderTutor,
            voice: renderVoice,
        },
        rootEl
    );
}

document.addEventListener('DOMContentLoaded', bootstrap);
