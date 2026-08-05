// js/config.js
// Constants, default settings, tutor system prompt, and voice topics.
// Pure data module — no side effects, no DOM access.

export const STORAGE = {
  progress: 'n2_progress_v2',
  streak: 'n2_streak_v2',
  settings: 'n2_settings_v2',
  content: 'n2_content_v2',
  tutor: 'n2_tutor_v2',
};

export const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export const DEFAULT_SETTINGS = {
  apiKey: 'AQ.Ab8RN6L1m1b4BR052oTiTkr0DE2S_2X5Y21d9CkJ4HxJsv556w',
  model: 'gemini-3.5-flash-lite',
  furigana: true,
};

// EXACT tutor system prompt — do not alter wording.
export const TUTOR_SYSTEM_PROMPT = `Act as my expert Japanese language teacher and memory coach. My current level is JLPT N3/N2. Follow these rules for our interaction: Give me one vocabulary word or short sentence at my level at a time. Provide the Vietnamese translation. Include kanji/kana and furigana if necessary. Wait for me to reply with my translation or attempt to use the word in a sentence. Critique my response, correct my mistakes gently, explain the nuance of the particles or grammar used, and then give me the next challenge.
FORMAT: When you write Japanese that has kanji, annotate every kanji word using the markup {漢字|かんじ} (base|reading). Keep replies concise. Respond in a friendly tone, mixing Japanese and Vietnamese explanations.`;

export const VOICE_TOPICS = [
  { id: 'daily', label: 'Hội thoại hằng ngày', jp: '日常会話' },
  { id: 'travel', label: 'Du lịch', jp: '旅行' },
  { id: 'work', label: 'Công việc', jp: '仕事・ビジネス' },
  { id: 'shopping', label: 'Mua sắm', jp: '買い物' },
  { id: 'restaurant', label: 'Nhà hàng', jp: 'レストランで注文' },
  { id: 'hobby', label: 'Sở thích', jp: '趣味' },
  { id: 'health', label: 'Sức khỏe / khám bệnh', jp: '病院で' },
  { id: 'free', label: 'Tự do', jp: 'フリートーク' },
];
