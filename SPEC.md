# N2 Japanese Learning Web App — Specification

> **Trạng thái: đặc tả lịch sử, đã được thay thế.** Tài liệu này mô tả hướng React/PWA ban đầu và không còn là danh sách task hiện hành. Bản vanilla v2 dùng `docs/FEATURE_PLAN.md` làm product authority, `docs/EXTRACT_SPEC.md` cho dữ liệu sách, `docs/DESIGN_TYPO.md` cho giao diện và `docs/BUILD_SPEC.md` cho contract nền.

## 1. Project Overview

**Name:** N2 Web  
**Purpose:** JLPT N2 vocabulary/grammar learning tool with spaced repetition  
**Stack:** React 18 + TypeScript + Vite + Tailwind CSS  
**Data:** Static JSON + localStorage (no backend)  
**Deploy:** GitHub Pages + custom domain (n2web.example.com)  
**Target:** Japanese learners preparing for JLPT N2  

---

## 2. Data Model

### Lesson
```typescript
interface Lesson {
  id: string;                    // "lesson-01"
  title: string;                 // "Lesson 1: 基礎動詞"
  categoryId: string;            // "vocab" | "grammar" | "kanji"
  order: number;                 // display order
  items: LessonItem[];           // vocabulary/grammar entries
}

interface LessonItem {
  id: string;                    // "item-001"
  japanese: string;              // "食べる"
  reading: string;               // "たべる"
  meaning: string;               // "to eat"
  example?: string;              // "りんごを食べる"
  exampleReading?: string;       // "りんごをたべる"
  exampleMeaning?: string;       // "eat an apple"
  tags?: string[];               // ["verb", "ru-verb", "basic"]
}
```

### Category
```typescript
interface Category {
  id: string;                    // "vocab" | "grammar" | "kanji"
  name: string;                  // "Vocabulary" | "Grammar" | "Kanji"
  icon: string;                  // lucide icon name
  color: string;                 // tailwind color class
  description: string;
  lessonCount: number;
}
```

### UserProgress
```typescript
interface UserProgress {
  userId: string;                // "anonymous" (no auth)
  lessonProgress: Record<string, LessonProgress>;  // key: lessonId
  reviewQueue: ReviewItem[];     // spaced repetition queue
  stats: UserStats;
  settings: UserSettings;
  lastUpdated: number;           // timestamp
}

interface LessonProgress {
  lessonId: string;
  completedItems: string[];      // item IDs marked as known
  lastStudied: number;
  mastery: number;               // 0-100 percentage
}

interface ReviewItem {
  itemId: string;
  lessonId: string;
  interval: number;              // days until next review
  easeFactor: number;            // SM-2 algorithm factor
  dueDate: number;               // timestamp
  lapses: number;                // times forgotten
}

interface UserStats {
  totalStudied: number;
  totalReviews: number;
  correctReviews: number;
  streakDays: number;
  lastActiveDate: string;        // "YYYY-MM-DD"
}

interface UserSettings {
  dailyGoal: number;             // items per day (default: 20)
  showReading: boolean;          // show furigana (default: true)
  showMeaning: boolean;          // show meaning (default: true)
  audioEnabled: boolean;         // TTS playback (default: true)
  theme: "light" | "dark" | "system";
}
```

---

## 3. Component Architecture

```
App
├── Header
│   ├── Logo
│   ├── CategoryTabs (Vocab/Grammar/Kanji)
│   └── ProgressRing (daily goal)
├── Main
│   ├── Dashboard (landing)
│   │   ├── StatsCards
│   │   ├── ContinueLearning
│   │   └── ReviewButton
│   ├── LessonList
│   │   ├── CategoryFilter
│   │   └── LessonCard[]
│   ├── StudyView
│   │   ├── Flashcard
│   │   │   ├── CardFront (japanese + reading)
│   │   │   └── CardBack (meaning + example)
│   │   ├── ActionButtons (Again/Hard/Good/Easy)
│   │   └── ProgressBar
│   ├── ReviewView
│   │   └── (reuses Flashcard + ActionButtons)
│   └── Settings
│       ├── DailyGoalInput
│       ├── ToggleSwitches
│       └── DataManagement (export/import/clear)
└── Footer
    ├── Version
    └── Links
```

**Shared Components:** `Button`, `Card`, `Modal`, `Toast`, `Icon`, `ProgressRing`, `LoadingSpinner`

---

## 4. State Management (localStorage Schema)

**Key:** `n2web:v1`

```json
{
  "version": 1,
  "userId": "anonymous",
  "lessonProgress": {
    "lesson-01": {
      "lessonId": "lesson-01",
      "completedItems": ["item-001", "item-002"],
      "lastStudied": 1700000000000,
      "mastery": 40
    }
  },
  "reviewQueue": [
    {
      "itemId": "item-001",
      "lessonId": "lesson-01",
      "interval": 1,
      "easeFactor": 2.5,
      "dueDate": 1700086400000,
      "lapses": 0
    }
  ],
  "stats": {
    "totalStudied": 15,
    "totalReviews": 8,
    "correctReviews": 6,
    "streakDays": 3,
    "lastActiveDate": "2024-11-14"
  },
  "settings": {
    "dailyGoal": 20,
    "showReading": true,
    "showMeaning": true,
    "audioEnabled": true,
    "theme": "system"
  },
  "lastUpdated": 1700000000000
}
```

**Migration Strategy:** Version key enables future migrations. On load, if version mismatch → run migration function → save.

---

## 5. Deployment Strategy

### GitHub Pages
- **Branch:** `gh-pages` (auto-deploy via GitHub Actions)
- **Build:** `npm run build` → outputs to `dist/`
- **Base path:** `/` (custom domain) or `/n2-web/` (project site)
- **SPA fallback:** `404.html` + `index.html` redirect for client-side routing

### Custom Domain
- **Domain:** `n2web.example.com` (configure in repo Settings → Pages)
- **DNS:** CNAME → `<username>.github.io`
- **HTTPS:** Enforced by GitHub Pages
- **Cache:** `Cache-Control: max-age=31536000, immutable` for assets; `no-cache` for HTML

### CI/CD Pipeline (`.github/workflows/deploy.yml`)
```yaml
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci && npm run build
      - uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./dist
          cname: n2web.example.com
```

---

## 6. File Structure

```
n2-web/
├── public/
│   ├── data/
│   │   ├── categories.json
│   │   ├── lessons/
│   │   │   ├── vocab-01.json
│   │   │   ├── grammar-01.json
│   │   │   └── kanji-01.json
│   │   └── manifest.json          # lesson index for lazy loading
│   ├── 404.html                   # SPA fallback
│   ├── favicon.ico
│   └── manifest.webmanifest       # PWA manifest
├── src/
│   ├── components/
│   │   ├── ui/                    # Button, Card, Modal, Toast, Icon, ProgressRing
│   │   ├── layout/                # Header, Footer, Main
│   │   ├── study/                 # Flashcard, ActionButtons, ProgressBar
│   │   ├── dashboard/             # StatsCards, ContinueLearning, ReviewButton
│   │   ├── lessons/               # LessonList, LessonCard, CategoryFilter
│   │   └── settings/              # SettingsForm, DataManagement
│   ├── hooks/
│   │   ├── useProgress.ts         # localStorage CRUD + migration
│   │   ├── useLessons.ts          # lesson loading + filtering
│   │   ├── useReview.ts           # SM-2 algorithm
│   │   ├── useStats.ts            # streak, daily goal calculation
│   │   └── useTheme.ts            # dark/light/system
│   ├── store/
│   │   └── progressStore.ts       # Zustand store (optional) or Context
│   ├── types/
│   │   └── index.ts               # all TypeScript interfaces
│   ├── utils/
│   │   ├── sm2.ts                 # spaced repetition algorithm
│   │   ├── date.ts                # date helpers
│   │   ├── storage.ts             # localStorage wrapper
│   │   └── audio.ts               # Web Speech API wrapper
│   ├── pages/
│   │   ├── Dashboard.tsx
│   │   ├── LessonList.tsx
│   │   ├── StudyView.tsx
│   │   ├── ReviewView.tsx
│   │   └── Settings.tsx
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css                  # Tailwind imports + custom CSS
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
├── postcss.config.js
├── .github/workflows/deploy.yml
└── README.md
```

---

## 7. Acceptance Criteria

### Core Features
- [ ] **Dashboard** shows stats, streak, continue button, review button
- [ ] **Lesson List** filters by category, shows progress per lesson
- [ ] **Study Mode** flashcard flip, 4-button SM-2 grading (Again/Hard/Good/Easy)
- [ ] **Review Mode** pulls due items from queue, same flashcard UI
- [ ] **Progress Persistence** survives browser close, localStorage schema v1
- [ ] **Settings** daily goal, toggles, export/import/clear data

### Technical
- [ ] TypeScript strict mode, zero `any`
- [ ] ESLint + Prettier pass
- [ ] Build succeeds (`npm run build`)
- [ ] Lighthouse: Performance ≥ 90, Accessibility ≥ 95, Best Practices ≥ 90, SEO ≥ 90
- [ ] Works offline (Service Worker caches static assets)
- [ ] Responsive: mobile (375px), tablet (768px), desktop (1440px)

### Data
- [ ] 3 categories × ≥5 lessons each
- [ ] ≥10 items per lesson
- [ ] Example sentences with readings for each item

### Deployment
- [ ] GitHub Actions deploys on push to main
- [ ] Custom domain serves over HTTPS
- [ ] SPA routing works on refresh (404.html redirect)
- [ ] Cache headers correct for assets vs HTML

### Accessibility
- [ ] Keyboard navigable (Tab, Enter, Space, Arrow keys)
- [ ] ARIA labels on interactive elements
- [ ] Color contrast ≥ 4.5:1
- [ ] Reduced motion respected
- [ ] Screen reader announces card flip, progress updates

---

*Generated: 2026-08-05*  
*Version: 1.0*
