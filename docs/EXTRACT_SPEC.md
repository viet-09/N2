# N2_web — BOOK EXTRACTION SPEC (authoritative schema for extractor + renderer)

Source = user's OWNED Somatome N2 scanned PDFs in `N2_somatome/`. Extract Japanese VERBATIM.
Book glosses are English (+ zh/ko) — keep **English** meaning as printed. NO AI-authored study content.
Furigana: the book prints readings above kanji. Encode every kanji word as `{漢字|よみ}` markup so the app can toggle furigana. Kana stays plain.

Output files: `data/book/<category>.json` — one JSON object mapping lessonId → content object.
lessonIds match data/lessons.json (g/v/k/r/l + week + d + day, e.g. `k1d1`, `v3d7`).

## Rendering pages (helper for extractor agents)
Use Python `fitz` (pymupdf, already installed):
```python
import fitz
doc = fitz.open("N2_somatome/49. Somatome N2 Kanji.pdf")
doc[PAGE].get_pixmap(dpi=130).save("<scratch>/p<PAGE>.png")
```
Then Read the PNG(s) and transcribe. PDF page index ≈ printed page number (offset 0 for Kanji).

## Schemas per category

### kanji  (book: 49 Kanji)
```
"k1d1": {
  "title": "立て札・注意書き",            // JP lesson title (with {kanji|reading} where printed)
  "titleEn": "Notices and Warnings",     // English subtitle as printed
  "kanji": [
    { "char":"禁", "strokes":13, "on":"キン", "kun":"",   // on=katakana readings, kun=hiragana (with ・ okurigana dots as printed), "" if none
      "words":[                                            // the compound/example words printed for that kanji
        {"jp":"禁止","reading":"きんし","en":"prohibition"}
      ] }
  ],
  "practice": [                                            // the 練習 block
    { "prompt":"「関係者以外立ち入り禁止」＝関係者でない人は（　）",
      "options":["入らなければならない","入ってはいけない"],
      "answerIndex":1 }                                    // 0-based; from the 解答 booklet (別冊). -1 if not resolvable.
  ],
  "reviewKanji": []                                        // ONLY on the 7日目 lesson: the end-of-week
  // "よめるかな?" review column kanji (same {char,strokes,on,kun,words[]} shape). Put them HERE, not mixed
  // into the exam's kanji[]. Empty array if the week has no such column.
}
```
CONVENTIONS (locked from proof run — apply to every week):
- Okurigana boundary within a kun reading = `・` ; separate multiple readings with `、` (e.g. `あぶ・ない、あや・うい`). Special/bracketed readings keep the book's 《…》.
- In 実戦問題 問題1/問題2, wrap the tested word in `【】` inside the prompt so the app can highlight it.
- Cloze questions sharing one word bank: give each blank the full printed bank as `options` and the correct `answerIndex`.

### vocabulary  (book: 50 Goi) — "おぼえましょう" word lists + 練習
```
"v1d1": {
  "title":"アパートを探しています", "titleEn":"I'm looking for an apartment",
  "sections":[                                            // one per おぼえましょう block (may be 1-3)
    { "heading":"アパート／マンションのチラシの情報",     // "" if none
      "words":[ {"jp":"賃貸アパート","reading":"ちんたいアパート","en":"a rental apartment","note":""} ] }
  ],
  "practice":[ {"prompt":"...","options":["...","..."],"answerIndex":0} ]
}
```

### grammar  (book: 51 Bunpo) — each day = several patterns + 練習
```
"g1d1": {
  "title":"...", "titleEn":"...",
  "patterns":[
    { "form":"～気味",                                    // the grammar form/headword
      "meaningEn":"seem; -ish (a slight tendency)",       // English gloss as printed
      "connection":"",                                    // 接続 if printed, else ""
      "examples":[ {"jp":"風邪気味です。","en":"..."} ] } // example sentences printed under the pattern (en gloss if printed, else "")
  ],
  "practice":[ {"prompt":"...","options":["...","..."],"answerIndex":0} ]
}
```

### reading  (book: 52 Dokkai) — passage + questions
```
"r1d1": {
  "title":"...", "titleEn":"...",
  "intro":"",                                             // any instruction line, else ""
  "passages":[
    { "heading":"",                                       // e.g. flyer title, else ""
      "text":"<passage text, one paragraph/line per \\n, furigana where printed>" }
  ],
  "questions":[ {"prompt":"...","options":["...","...","...","..."],"answerIndex":2} ]
}
```

### listening  (book: 53 Chokai) — script + questions + audio ref
```
"l1d1": {
  "title":"...", "titleEn":"...",
  "audio":"",                                             // mp3 filename if identifiable from a CD track number, else ""
  "script":"<full transcript, one speaker turn per \\n, e.g. 男：… / 女：…, furigana where printed>",
  "questions":[ {"prompt":"...","options":["...","..."],"answerIndex":0} ]
}
```

## Rules for extractor agents
- Transcribe EXACTLY what the page shows (Japanese, punctuation, numbers). Do not paraphrase or translate the Japanese.
- English gloss = copy the English printed in the book. If a field isn't printed, use "" (or omit optional fields), never invent.
- Encode furigana as `{漢字|よみ}` for every kanji word where the book shows a reading. If unsure of a reading, still include the kanji as plain text (never guess a wrong reading).
- Practice answers come from the 解答・解説 booklet at the back of each book (別冊). If you can read it, fill answerIndex; else set -1.
- Validate the JSON parses before finishing.
