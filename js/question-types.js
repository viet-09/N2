// js/question-types.js — closed-set question type labels + Vietnamese tooltips.
// Source: docs/EXTRACT_SPEC.md appendix. Keep in sync with TYPE_WHITELIST in
// scripts/classify-questions.mjs and ENRICHMENT_TYPE_WHITELIST in
// scripts/validate-book-data.mjs.

export const QUESTION_TYPE_LABELS = {
  'kanji-yomi':     { label: 'Đọc',           tip: 'Chọn cách đọc đúng (âm on/kun) của từ trong ngoặc 【】.' },
  'kanji-toroku':   { label: 'Điền Hán tự',   tip: 'Chọn chữ Hán phù hợp để điền vào chỗ trống.' },
  'kanji-hanbetsu': { label: 'Phân biệt Hán tự', tip: 'Chọn từ đồng âm/dị nghĩa để điền vào câu.' },
  'kanji-sakubun':  { label: 'Đặt câu',       tip: 'Viết câu dùng Hán tự cho trước.' },

  'vocab-fukugougo': { label: 'Ghép từ',      tip: 'Chọn từ ghép / cụm từ phù hợp ngữ cảnh.' },
  'vocab-rentai':    { label: 'Liên kết từ',   tip: 'Chọn từ đồng nghĩa / trái nghĩa / dùng cùng loại.' },
  'vocab-yougo':     { label: 'Danh từ',       tip: 'Chọn cách dùng đúng của danh từ / 副詞 cho sẵn.' },

  'grammar-bunpou':  { label: 'Ngữ pháp',      tip: 'Chọn mẫu ngữ pháp đúng cho vị trí 【】.' },
  'grammar-hyougen': { label: 'Diễn đạt',      tip: 'Chọn cách diễn đạt tự nhiên nhất trong ngữ cảnh.' },
  'grammar-tadose':  { label: 'Sắp xếp',       tip: 'Sắp xếp các phần để tạo câu hoàn chỉnh.' },

  'reading-shusho':  { label: 'Chủ đề',        tip: 'Chọn chủ đề / tiêu đề phù hợp cho đoạn văn.' },
  'reading-riyuu':   { label: 'Lý do',         tip: 'Chọn lý do / nguyên nhân được nêu trong đoạn.' },
  'reading-chikoku': { label: 'Chi tiết',      tip: 'Tìm chi tiết cụ thể trong bài đọc.' },
  'reading-josou':   { label: 'Phán đoán',     tip: 'Suy ra điều tác giả ngầm nói / quan điểm.' },
  'reading-mix':     { label: 'Hỗn hợp',       tip: 'Bài đọc nhiều đoạn, yêu cầu kết hợp thông tin.' },

  'listening-kadai':    { label: 'Hiểu đề bài', tip: 'Nắm yêu cầu / tình huống trước khi nghe.' },
  'listening-point':    { label: 'Điểm chính',  tip: 'Chọn đáp án đúng theo nội dung nghe được.' },
  'listening-gaiyou':   { label: 'Tổng quát',   tip: 'Chọn ý phù hợp với toàn bộ đoạn nghe.' },
  'listening-imamashii':{ label: 'Cảnh huống',  tip: 'Bài nghe tình huống (gọi điện, đặt lịch…).' },
};

export function questionTypeInfo(type) {
  return QUESTION_TYPE_LABELS[type] || { label: type || '—', tip: '' };
}