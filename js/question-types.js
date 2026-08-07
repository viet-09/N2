// js/question-types.js — closed-set question type labels + Japanese tooltips
// matching the Somatome book headings. Keep in sync with TYPE_WHITELIST in
// scripts/classify-questions.mjs and ENRICHMENT_TYPE_WHITELIST in
// scripts/validate-book-data.mjs.

export const QUESTION_TYPE_LABELS = {
  'kanji-yomi':     { label: '読み',   tip: '【】内の語の読み方を選ぶ。' },
  'kanji-toroku':   { label: '書き',   tip: '【】に入る漢字を選ぶ。' },
  'kanji-hanbetsu': { label: '漢字辨別', tip: '同音異義語・類似する漢字から選ぶ。' },
  'kanji-sakubun':  { label: '作文',   tip: '指定された漢字を使って文を作る。' },

  'vocab-fukugougo': { label: '複合語', tip: '文脈に合う複合語・連語を選ぶ。' },
  'vocab-rentai':    { label: '連体',  tip: '同じ系統の語・類義語・対義語を選ぶ。' },
  'vocab-yougo':     { label: '用語',  tip: '名詞・副詞などの使い方を選ぶ。' },

  'grammar-bunpou':  { label: '文法形式', tip: '【】に入る文法形式を選ぶ。' },
  'grammar-hyougen': { label: '表現',    tip: '文脈に最も自然な表現を選ぶ。' },
  'grammar-tadose':  { label: '整序',    tip: '語を並べ替えて正しい文を作る。' },

  'reading-shusho':  { label: '主旨',  tip: '文章の主題・タイトルを選ぶ。' },
  'reading-riyuu':   { label: '理由',  tip: '筆者が示す理由・原因を選ぶ。' },
  'reading-chikoku': { label: '詳節',  tip: '文章中の具体的事実を探す。' },
  'reading-josou':   { label: '除想',  tip: '筆者の意見・暗示されている内容を推察する。' },
  'reading-mix':     { label: '複合',  tip: '複数の文章を読み合わせて答える。' },

  'listening-kadai':     { label: '課題理解', tip: '聴く前に状況・課題を把握する。' },
  'listening-point':     { label: 'ポイント', tip: '聞いた内容から正しい答えを選ぶ。' },
  'listening-gaiyou':    { label: '概要',     tip: '全体の内容に合うものを選ぶ。' },
  'listening-imamashii': { label: '即時応答', tip: '場面に応じた応答を選ぶ。' },
};

export function questionTypeInfo(type) {
  return QUESTION_TYPE_LABELS[type] || { label: type || '—', tip: '' };
}