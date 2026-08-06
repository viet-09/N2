"""Extract owned, image-only Somatome PDFs into EXTRACT_SPEC book JSON.

The script sends only the page images for one lesson to Gemini, then performs a
second image-grounded correction pass. It checkpoints every lesson to a draft
file, so rate limits or interrupted runs are resumable.

Usage:
  GEMINI_API_KEY=... python scripts/extract_book.py --category kanji --ids k2d1
  GEMINI_API_KEY=... python scripts/extract_book.py --category vocabulary --jobs 2
"""

from __future__ import annotations

import argparse
import base64
import concurrent.futures
import json
import os
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

import fitz


ROOT = Path(__file__).resolve().parents[1]
BOOK_DIR = ROOT / "data" / "book"
SOURCE_DIR = ROOT / "N2_somatome"
DEFAULT_MODEL = "gemini-3.5-flash"

BOOKS: dict[str, dict[str, Any]] = {
    "kanji": {
        "prefix": "k",
        "pdf": "49. Somatome N2 Kanji.pdf",
        "unit_starts": [11, 27, 43, 59, 75, 91, 107, 123],
        "days": 7,
        "extra_review": True,
    },
    "vocabulary": {
        "prefix": "v",
        "pdf": "50. Somatome N2 Goi.pdf",
        "unit_starts": [11, 27, 43, 59, 75, 91, 107, 123],
        "days": 7,
    },
    "grammar": {
        "prefix": "g",
        "pdf": "51. Somatome N2 Bunpo.pdf",
        "unit_starts": [13, 29, 45, 61, 77, 93, 109, 125],
        "days": 7,
    },
    "reading": {
        "prefix": "r",
        "pdf": "52. Somatome N2 Dokkai.pdf",
        "unit_starts": [11, 27, 43, 59, 77, 95],
        "days": 7,
    },
    "listening": {
        "prefix": "l",
        "pdf": "53. Somatome N2 Chokai.pdf",
        "lesson_pages": [
            [12, 14, 16, 18, 20],
            [24, 26, 28, 30, 32, 34, 36],
            [40, 42, 44, 46, 48],
            [52, 54, 56, 58, 60],
            [63],
        ],
    },
}

STR = {"type": "STRING"}
QUESTION = {
    "type": "OBJECT",
    "properties": {
        "prompt": STR,
        "options": {"type": "ARRAY", "items": STR},
        "answerIndex": {"type": "INTEGER"},
    },
    "required": ["prompt", "options", "answerIndex"],
}

SCHEMAS: dict[str, dict[str, Any]] = {
    "kanji": {
        "type": "OBJECT",
        "properties": {
            "title": STR,
            "titleEn": STR,
            "kanji": {
                "type": "ARRAY",
                "items": {
                    "type": "OBJECT",
                    "properties": {
                        "char": STR,
                        "strokes": {"type": "INTEGER"},
                        "on": STR,
                        "kun": STR,
                        "words": {
                            "type": "ARRAY",
                            "items": {
                                "type": "OBJECT",
                                "properties": {"jp": STR, "reading": STR, "en": STR},
                                "required": ["jp", "reading", "en"],
                            },
                        },
                    },
                    "required": ["char", "strokes", "on", "kun", "words"],
                },
            },
            "practice": {"type": "ARRAY", "items": QUESTION},
            "reviewKanji": {
                "type": "ARRAY",
                "items": {
                    "type": "OBJECT",
                    "properties": {
                        "char": STR,
                        "strokes": {"type": "INTEGER"},
                        "on": STR,
                        "kun": STR,
                        "words": {
                            "type": "ARRAY",
                            "items": {
                                "type": "OBJECT",
                                "properties": {"jp": STR, "reading": STR, "en": STR},
                                "required": ["jp", "reading", "en"],
                            },
                        },
                    },
                    "required": ["char", "strokes", "on", "kun", "words"],
                },
            },
        },
        "required": ["title", "titleEn", "kanji", "practice", "reviewKanji"],
    },
    "vocabulary": {
        "type": "OBJECT",
        "properties": {
            "title": STR,
            "titleEn": STR,
            "sections": {
                "type": "ARRAY",
                "items": {
                    "type": "OBJECT",
                    "properties": {
                        "heading": STR,
                        "words": {
                            "type": "ARRAY",
                            "items": {
                                "type": "OBJECT",
                                "properties": {"jp": STR, "reading": STR, "en": STR, "note": STR},
                                "required": ["jp", "reading", "en", "note"],
                            },
                        },
                    },
                    "required": ["heading", "words"],
                },
            },
            "practice": {"type": "ARRAY", "items": QUESTION},
        },
        "required": ["title", "titleEn", "sections", "practice"],
    },
    "grammar": {
        "type": "OBJECT",
        "properties": {
            "title": STR,
            "titleEn": STR,
            "patterns": {
                "type": "ARRAY",
                "items": {
                    "type": "OBJECT",
                    "properties": {
                        "form": STR,
                        "meaningEn": STR,
                        "connection": STR,
                        "examples": {
                            "type": "ARRAY",
                            "items": {
                                "type": "OBJECT",
                                "properties": {"jp": STR, "en": STR},
                                "required": ["jp", "en"],
                            },
                        },
                    },
                    "required": ["form", "meaningEn", "connection", "examples"],
                },
            },
            "practice": {"type": "ARRAY", "items": QUESTION},
        },
        "required": ["title", "titleEn", "patterns", "practice"],
    },
    "reading": {
        "type": "OBJECT",
        "properties": {
            "title": STR,
            "titleEn": STR,
            "intro": STR,
            "passages": {
                "type": "ARRAY",
                "items": {
                    "type": "OBJECT",
                    "properties": {"heading": STR, "text": STR},
                    "required": ["heading", "text"],
                },
            },
            "questions": {"type": "ARRAY", "items": QUESTION},
        },
        "required": ["title", "titleEn", "intro", "passages", "questions"],
    },
    "listening": {
        "type": "OBJECT",
        "properties": {
            "title": STR,
            "titleEn": STR,
            "audio": STR,
            "script": STR,
            "questions": {"type": "ARRAY", "items": QUESTION},
        },
        "required": ["title", "titleEn", "audio", "script", "questions"],
    },
}

CATEGORY_GUIDANCE = {
    "kanji": "Transcribe every kanji card, printed strokes/readings/words/English glosses and every 練習 item. For day 1-6 use kanji and keep reviewKanji empty. For every day 7, set kanji to [] and treat the third attached scan as the reference/review page: transcribe every large numbered kanji card in its lower reference section into reviewKanji, including all printed fields; never omit that third page.",
    "vocabulary": "Transcribe every おぼえましょう block as a section, every word/readings/printed English gloss/note, and every 練習 item.",
    "grammar": "Transcribe every grammar form, printed English meaning, 接続/connection, every printed Japanese example and printed English gloss, plus every 練習 item.",
    "reading": "Transcribe the entire passage exactly with line breaks, headings/instructions and every question/choice. Do not summarize.",
    "listening": "Transcribe all visible task text/questions. When a supporting answer/script booklet PDF is attached, locate the exact section by the lesson heading and printed front-page reference, copy its complete スクリプト verbatim, and use its printed こたえ to resolve answerIndex. Keep audio empty; it is mapped separately from local files.",
}


def lesson_ids(category: str) -> list[str]:
    config = BOOKS[category]
    if category == "listening":
        return [
            f"l{unit}d{day}"
            for unit, pages in enumerate(config["lesson_pages"], start=1)
            for day in range(1, len(pages) + 1)
        ]
    return [
        f"{config['prefix']}{unit}d{day}"
        for unit in range(1, len(config["unit_starts"]) + 1)
        for day in range(1, config["days"] + 1)
    ]


def pages_for(category: str, lesson_id: str) -> list[int]:
    match = re.fullmatch(r"[a-z](\d+)d(\d+)", lesson_id)
    if not match:
        raise ValueError(f"Invalid lesson id: {lesson_id}")
    unit, day = map(int, match.groups())
    config = BOOKS[category]
    if category == "listening":
        start = config["lesson_pages"][unit - 1][day - 1]
        return list(range(63, 71)) if lesson_id == "l5d1" else [start, start + 1]
    cover = config["unit_starts"][unit - 1]
    start = cover + 1 + (day - 1) * 2
    pages = [start, start + 1]
    if category == "kanji" and day == 7:
        pages.append(start + 2)
    return pages


def render_pages(pdf_path: Path, page_numbers: list[int], dpi: int) -> list[str]:
    images: list[str] = []
    with fitz.open(pdf_path) as document:
        for page_number in page_numbers:
            if page_number < 0 or page_number >= document.page_count:
                raise IndexError(f"Page {page_number} outside {pdf_path.name}")
            pixmap = document[page_number].get_pixmap(dpi=dpi, alpha=False)
            data = pixmap.tobytes("jpeg", jpg_quality=86)
            images.append(base64.b64encode(data).decode("ascii"))
    return images


def api_request(
    api_key: str,
    model: str,
    category: str,
    lesson_id: str,
    images: list[str],
    draft: dict[str, Any] | None,
    reference_uri: str = "",
    retries: int = 6,
) -> dict[str, Any]:
    if draft is None:
        task = (
            f"Extract lesson {lesson_id} from the attached scans into the exact JSON schema. "
            f"{CATEGORY_GUIDANCE[category]}"
        )
    else:
        task = (
            f"Image-grounded verification pass for lesson {lesson_id}. Compare every field of the draft below against all attached scans, correct every OCR/transcription/schema error, and return the complete corrected object. Do not preserve a draft value when the scan differs.\nDRAFT:\n"
            + json.dumps(draft, ensure_ascii=False)
            + "\nCATEGORY REQUIREMENTS:\n"
            + CATEGORY_GUIDANCE[category]
        )

    if reference_uri:
        task += (
            " A supporting answer/script booklet is attached after the scan images. "
            "Match its printed week/day, heading, and question numbers to this exact lesson; "
            "use it to set each zero-based answerIndex when explicitly shown."
        )

    rules = (
        "The scans are the only source of truth. Copy Japanese, punctuation, numbers, and printed English verbatim. "
        "Never translate, paraphrase, summarize, fill missing text from memory, or invent an answer. "
        "For title, copy only the prominent lesson topic heading; omit recurring book chrome such as 第N週, N日目, category labels, and page numbers. "
        "For every English field, use only English visibly printed in the source; if none is printed, use an empty string. Never put Chinese, Korean, Vietnamese, or a model translation in an English field. "
        "Keep each printed numbered exercise and each blank as its own question, and preserve each printed choice as one option; never combine adjacent questions or blanks. "
        "Use {漢字|よみ} only where a printed reading can be read confidently; otherwise retain plain kanji. "
        "answerIndex is zero-based. Use -1 only when the correct choice is not explicitly resolvable from the lesson scans or attached answer booklet. "
        "Return JSON only."
    )
    parts: list[dict[str, Any]] = [{"text": task}]
    parts.extend({"inlineData": {"mimeType": "image/jpeg", "data": image}} for image in images)
    if reference_uri:
        parts.append({"fileData": {"mimeType": "application/pdf", "fileUri": reference_uri}})
    payload = {
        "systemInstruction": {"parts": [{"text": rules}]},
        "contents": [{"role": "user", "parts": parts}],
        "generationConfig": {
            "temperature": 0,
            "responseMimeType": "application/json",
            "responseSchema": SCHEMAS[category],
            "maxOutputTokens": 65536,
        },
    }
    endpoint = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        + urllib.parse.quote(model, safe="")
        + ":generateContent?key="
        + urllib.parse.quote(api_key, safe="")
    )
    body = json.dumps(payload).encode("utf-8")

    for attempt in range(retries):
        try:
            request = urllib.request.Request(
                endpoint,
                data=body,
                method="POST",
                headers={"Content-Type": "application/json"},
            )
            with urllib.request.urlopen(request, timeout=240) as response:
                result = json.load(response)
            parts_out = result["candidates"][0]["content"]["parts"]
            text = "".join(part.get("text", "") for part in parts_out)
            text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip())
            parsed = json.loads(text)
            if not isinstance(parsed, dict):
                raise ValueError("Gemini response is not an object")
            return parsed
        except urllib.error.HTTPError as error:
            retryable = error.code in {408, 409, 429, 500, 502, 503, 504}
            if not retryable or attempt + 1 >= retries:
                detail = error.read().decode("utf-8", "replace")[:500]
                raise RuntimeError(f"Gemini HTTP {error.code}: {detail}") from error
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, KeyError, ValueError) as error:
            if attempt + 1 >= retries:
                raise RuntimeError(f"Gemini response failed: {error}") from error
        time.sleep(min(60, 2 ** attempt + 1))
    raise RuntimeError("Gemini request exhausted retries")


def upload_reference_pdf(api_key: str, path: Path) -> tuple[str, str]:
    data = path.read_bytes()
    start_url = "https://generativelanguage.googleapis.com/upload/v1beta/files?key=" + urllib.parse.quote(api_key, safe="")
    metadata = json.dumps({"file": {"display_name": path.name}}).encode("utf-8")
    start = urllib.request.Request(
        start_url,
        data=metadata,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "X-Goog-Upload-Protocol": "resumable",
            "X-Goog-Upload-Command": "start",
            "X-Goog-Upload-Header-Content-Length": str(len(data)),
            "X-Goog-Upload-Header-Content-Type": "application/pdf",
        },
    )
    with urllib.request.urlopen(start, timeout=60) as response:
        upload_url = response.headers.get("X-Goog-Upload-URL")
    if not upload_url:
        raise RuntimeError("Gemini Files API did not return an upload URL")

    upload = urllib.request.Request(
        upload_url,
        data=data,
        method="POST",
        headers={
            "Content-Length": str(len(data)),
            "X-Goog-Upload-Offset": "0",
            "X-Goog-Upload-Command": "upload, finalize",
        },
    )
    with urllib.request.urlopen(upload, timeout=240) as response:
        result = json.load(response)
    file_info = result.get("file", result)
    name = file_info.get("name", "")
    uri = file_info.get("uri", "")
    if not name or not uri:
        raise RuntimeError("Gemini Files API returned no file name/URI")

    status_url = "https://generativelanguage.googleapis.com/v1beta/" + name + "?key=" + urllib.parse.quote(api_key, safe="")
    for _ in range(60):
        request = urllib.request.Request(status_url, method="GET")
        with urllib.request.urlopen(request, timeout=60) as response:
            status = json.load(response)
        state = status.get("state") or status.get("file", {}).get("state")
        if state == "ACTIVE":
            return name, uri
        if state == "FAILED":
            raise RuntimeError("Gemini failed to process the reference PDF")
        time.sleep(2)
    raise RuntimeError("Timed out waiting for Gemini reference PDF processing")


def delete_uploaded_file(api_key: str, name: str) -> None:
    if not name:
        return
    url = "https://generativelanguage.googleapis.com/v1beta/" + name + "?key=" + urllib.parse.quote(api_key, safe="")
    try:
        urllib.request.urlopen(urllib.request.Request(url, method="DELETE"), timeout=60).close()
    except Exception:
        pass


def id_sort_key(lesson_id: str) -> tuple[int, int]:
    match = re.search(r"(\d+)d(\d+)$", lesson_id)
    return tuple(map(int, match.groups())) if match else (999, 999)


def read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    return data if isinstance(data, dict) else {}


def atomic_write(path: Path, data: dict[str, Any]) -> None:
    ordered = {key: data[key] for key in sorted(data, key=id_sort_key)}
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(json.dumps(ordered, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temp.replace(path)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--category", required=True, choices=BOOKS)
    parser.add_argument("--ids", nargs="*", help="Only these lesson IDs")
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--jobs", type=int, default=1)
    parser.add_argument("--dpi", type=int, default=150)
    parser.add_argument("--one-pass", action="store_true", help="Skip the correction pass")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--force", action="store_true", help="Run a fresh extraction and correction even when cached")
    mode.add_argument(
        "--verify-existing",
        action="store_true",
        help="Use each cached lesson as the draft for one new image-grounded correction pass",
    )
    parser.add_argument("--reference-pdf", type=Path, help="Upload one supporting PDF and attach it to every lesson request")
    args = parser.parse_args()

    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise SystemExit("GEMINI_API_KEY is required")

    category = args.category
    allowed = lesson_ids(category)
    selected = args.ids or allowed
    unknown = sorted(set(selected) - set(allowed))
    if unknown:
        raise SystemExit(f"IDs do not belong to {category}: {', '.join(unknown)}")

    BOOK_DIR.mkdir(parents=True, exist_ok=True)
    output_path = BOOK_DIR / f"{category}.draft.json"
    canonical_path = BOOK_DIR / f"{category}.json"
    output = {**read_json(canonical_path), **read_json(output_path)}
    atomic_write(output_path, output)
    lock = threading.Lock()
    pdf_path = SOURCE_DIR / BOOKS[category]["pdf"]
    reference_name = ""
    reference_uri = ""
    if args.reference_pdf:
        reference_path = args.reference_pdf if args.reference_pdf.is_absolute() else ROOT / args.reference_pdf
        print(f"Uploading reference PDF {reference_path.name}…", flush=True)
        reference_name, reference_uri = upload_reference_pdf(api_key, reference_path)
        print("Reference PDF active.", flush=True)

    def extract(lesson_id: str) -> tuple[str, str]:
        with lock:
            existing = output.get(lesson_id)
            if existing is not None and not args.force and not args.verify_existing:
                return lesson_id, "cached"
            if args.verify_existing and existing is None:
                raise ValueError(f"No cached lesson to verify: {lesson_id}")
        page_numbers = pages_for(category, lesson_id)
        images = render_pages(pdf_path, page_numbers, args.dpi)
        if args.verify_existing:
            final = api_request(api_key, args.model, category, lesson_id, images, existing, reference_uri)
            status = f"verified pages={','.join(map(str, page_numbers))}"
        else:
            first = api_request(api_key, args.model, category, lesson_id, images, None, reference_uri)
            final = first if args.one_pass else api_request(api_key, args.model, category, lesson_id, images, first, reference_uri)
            status = f"pages={','.join(map(str, page_numbers))}"
        with lock:
            output[lesson_id] = final
            atomic_write(output_path, output)
        return lesson_id, status

    failures = 0
    jobs = max(1, min(args.jobs, 4))
    with concurrent.futures.ThreadPoolExecutor(max_workers=jobs) as executor:
        futures = {executor.submit(extract, lesson_id): lesson_id for lesson_id in selected}
        for future in concurrent.futures.as_completed(futures):
            lesson_id = futures[future]
            try:
                _, status = future.result()
                print(f"OK {lesson_id} {status}", flush=True)
            except Exception as error:  # keep other resumable jobs running
                failures += 1
                print(f"ERROR {lesson_id} {error}", flush=True)

    delete_uploaded_file(api_key, reference_name)
    print(f"DONE category={category} selected={len(selected)} failures={failures} output={output_path}")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
