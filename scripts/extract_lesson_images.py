"""Extract lesson-bound illustrations from owned Somatome PDFs.

For every lesson, render its source page(s) at high DPI, locate each raster image
inside the page (by examining the page's resource dict + XObject list), and
crop the image's bounding box out of the page render. Falls back to the full
page render when no discrete image is detected (kind = 'page').

Output:
  data/book/images/<category>/<lessonId>_<n>.png
  data/book/<category>.images.json  (skeleton; captions are filled by classify)

Usage:
  python scripts/extract_lesson_images.py --book kanji --limit k1d1
  python scripts/extract_lesson_images.py --book kanji  # whole book
  python scripts/extract_lesson_images.py --book all
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

import fitz  # PyMuPDF

# Shared book/page tables — kept in sync with scripts/extract_book.py
BOOKS: dict[str, dict] = {
    "kanji": {
        "prefix": "k",
        "pdf": "49. Somatome N2 Kanji.pdf",
        "unit_starts": [11, 27, 43, 59, 75, 91, 107, 123],
        "days": 7,
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

ROOT = Path(__file__).resolve().parents[1]
BOOK_DIR = ROOT / "data" / "book"
IMAGES_ROOT = BOOK_DIR / "images"
DEFAULT_PDF_DIR = ROOT / "N2_somatome"


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


def find_image_rects(page: fitz.Page) -> list[fitz.Rect]:
    """Return PDF-space rects of every raster image on the page."""
    rects: list[fitz.Rect] = []
    try:
        for img_info in page.get_images(full=True):
            xref = img_info[0]
            try:
                rects.extend(page.get_image_rects(xref))
            except Exception:
                continue
    except Exception:
        return []
    # Deduplicate by tuple, keep largest first
    seen: set[tuple[float, float, float, float]] = set()
    unique: list[fitz.Rect] = []
    for rect in sorted(rects, key=lambda r: -(r.width * r.height)):
        key = (round(rect.x0, 1), round(rect.y0, 1), round(rect.x1, 1), round(rect.y1, 1))
        if key in seen:
            continue
        seen.add(key)
        unique.append(rect)
    return unique


def extract_lesson(
    category: str,
    lesson_id: str,
    dpi: int,
    min_image_area_pt2: float,
    pdf_dir: Path,
) -> list[dict]:
    """Extract images for one lesson. Returns a list of manifest entries."""
    pdf_path = pdf_dir / BOOKS[category]["pdf"]
    out_dir = IMAGES_ROOT / category
    out_dir.mkdir(parents=True, exist_ok=True)
    manifest: list[dict] = []

    with fitz.open(pdf_path) as doc:
        for page_index in pages_for(category, lesson_id):
            if page_index < 0 or page_index >= doc.page_count:
                continue
            page = doc[page_index]
            page_rects = find_image_rects(page)
            # Filter out tiny icons / separator bits
            big_rects = [
                r for r in page_rects
                if r.width * r.height >= min_image_area_pt2
                and r.width < page.rect.width  # not full-page background
                and r.height < page.rect.height
            ]
            for n, rect in enumerate(big_rects, start=1):
                pix = page.get_pixmap(
                    dpi=dpi, clip=rect, alpha=False
                )
                fname = f"{lesson_id}_p{page_index}_{n}.png"
                pix.save(out_dir / fname)
                manifest.append(
                    {
                        "src": f"images/{category}/{fname}",
                        "kind": "image",
                        "page": page_index,
                    }
                )
    return manifest


def extract_book(
    category: str, limit: str | None, dpi: int, pdf_dir: Path
) -> dict[str, list[dict]]:
    ids = lesson_ids(category)
    if limit:
        wanted = {lid.strip() for lid in limit.split(",") if lid.strip()}
        ids = [lid for lid in ids if lid in wanted]
    output: dict[str, list[dict]] = {}
    for lid in ids:
        try:
            manifest = extract_lesson(category, lid, dpi, min_image_area_pt2=900, pdf_dir=pdf_dir)
            if manifest:
                output[lid] = manifest
                print(f"OK {category} {lid}: {len(manifest)} image(s)", flush=True)
            else:
                print(f"-- {category} {lid}: no discrete images", flush=True)
        except Exception as exc:
            print(f"ERROR {category} {lid}: {exc}", flush=True)
    return output


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--book",
        required=True,
        choices=list(BOOKS) + ["all"],
    )
    parser.add_argument("--limit", help="Comma-separated lesson IDs to restrict")
    parser.add_argument("--dpi", type=int, default=200)
    parser.add_argument(
        "--pdf-dir",
        type=Path,
        default=DEFAULT_PDF_DIR,
        help="Directory holding the Somatome PDFs (default: <repo>/N2_somatome).",
    )
    args = parser.parse_args()

    targets = list(BOOKS) if args.book == "all" else [args.book]
    combined: dict[str, dict[str, list[dict]]] = {}
    for cat in targets:
        print(f"=== {cat} ===", flush=True)
        combined[cat] = extract_book(cat, args.limit, args.dpi, args.pdf_dir)
        manifest_path = BOOK_DIR / f"{cat}.images.json"
        manifest_path.write_text(
            json.dumps(combined[cat], ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        total = sum(len(v) for v in combined[cat].values())
        print(f"wrote {manifest_path} ({total} image entries)", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())