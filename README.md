# 日本語総まとめ N2 Study Journal

Ứng dụng học N2 chạy trực tiếp bằng HTML/CSS/JavaScript ES modules. Nội dung bài học được trích từ bộ sách người dùng sở hữu; giao diện không tự tạo nội dung thay thế sách.

## Chạy cục bộ

```powershell
python -m http.server 8000 --bind 127.0.0.1
```

Mở `http://127.0.0.1:8000/`. Không mở bằng `file://`, vì trình duyệt cần tải ES modules và JSON qua HTTP.

## Tính năng

- Dashboard 233 bài theo cấu trúc thật của 5 sách, lưu tiến độ/tab/tuần/scroll.
- Renderer sách với furigana, nghĩa tiếng Anh nguyên bản, bài tập và TTS.
- Gia sư Gemini được seed bằng đúng ngữ cảnh của bài đang học.
- Giải thích từ/Hán tự ngắn bằng tiếng Việt, lưu cache cục bộ.
- Hồ sơ tên/avatar (avatar tải lên chỉ lưu cục bộ, không đồng bộ) và thú cưng streak cat/dog/dragon.
- Gemini Live: mic PCM16 16 kHz, audio 24 kHz, barge-in, phụ đề và transcript; tự chuyển sang ghi-rồi-gửi nếu Live không dùng được.
- Đăng nhập Google OAuth hoặc Email/Password (Supabase Auth) để đồng bộ tiến độ/streak/điểm và xem bảng xếp hạng cùng bạn bè.

Mọi lời gọi Gemini (gia sư, giải thích Hán tự, luyện nói) đi qua Supabase Edge Functions (`gemini-proxy`, `mint-live-token`) — key thật chỉ nằm trong `supabase secrets`, không có trong mã nguồn client. Vì vậy các tính năng AI cần đăng nhập; mở **Cài đặt** chỉ để chọn model, không cần nhập key.

## Dữ liệu sách

- Index: `data/lessons.json`.
- Nội dung canonical: `data/book/{kanji,vocabulary,grammar,reading,listening}.json`.
- Schema: `docs/EXTRACT_SPEC.md`.
- Validator nghiêm ngặt:

```powershell
node scripts/validate-book-data.mjs
```

Pipeline có checkpoint và hai lượt đối chiếu ảnh:

```powershell
$env:GEMINI_API_KEY = '...'
python scripts/extract_book.py --category grammar --jobs 2
node scripts/finalize-book-data.mjs
node scripts/validate-book-data.mjs
```

Các PDF/MP3 sở hữu, ảnh OCR, checkpoint draft và file tạm được `.gitignore`; không đưa chúng lên bản deploy công khai.

## Đặc tả có thẩm quyền

Theo thứ tự ưu tiên: `docs/FEATURE_PLAN.md`, `docs/EXTRACT_SPEC.md`, `docs/DESIGN_TYPO.md`, rồi `docs/BUILD_SPEC.md`. `SPEC.md` ở thư mục gốc là kế hoạch React/PWA cũ và không còn là acceptance criteria của bản vanilla v2.
