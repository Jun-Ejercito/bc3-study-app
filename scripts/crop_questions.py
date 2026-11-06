#!/usr/bin/env python3
"""Crop diagram/table questions from official exam PDFs. Answers are on separate PDFs."""
from __future__ import annotations
import json, re
from pathlib import Path
import pymupdf as fitz
from PIL import Image

ROOT = Path('/workspace/bc3-study-app')
OUT = ROOT / 'public' / 'img' / 'questions'
OUT.mkdir(parents=True, exist_ok=True)
MANIFEST_PATH = ROOT / 'public' / 'data' / 'image_manifest.json'

PDFMAP = {
    'R5後': '/workspace/exams/f1.pdf',
    'R6前': '/workspace/exams/f3.pdf',
    'R6後': '/workspace/exams/f5.pdf',
    'R7前': '/workspace/exams/f7.pdf',
    'R7後': '/workspace/exams/f9.pdf',
}
DPI = 220
MARGIN = 8  # PDF points

# Image-only page crops (pixel coords at 200dpi pdftoppm, scaled later) —
# R6前 p11 is a full-page scan; OCR y at 200dpi (1654x2339):
# Q32: 220–1095, Q33: 1095–1620, Q34: 1620–2100 (not in need list but available)
IMAGE_PAGE_CROPS = {
    'R6前-32': {
        'pdf': 'f3.pdf', 'pdf_page': 11,  # 1-based
        'pixel_bbox_200dpi': [40, 220, 1600, 1095],
        'note': 'Scanned page; Q32 only through options ア–エ before 問題33',
    },
}

NEED_IDS = [
    'R5後-17','R5後-31','R5後-32','R6前-10','R6前-11','R6前-32',
    'R6後-9','R6後-26','R6後-40','R7前-10','R7前-16','R7前-30',
    'R7前-35','R7前-40','R7後-11','R7後-20','R7後-32','R7後-33',
]


def find_label(page, qnum):
    fw = ''.join(chr(0xFF10 + int(d)) for d in str(qnum))
    pats = [f'問題{qnum}', f'問題 {qnum}', f'問題{fw}', f'問題 {fw}']
    for pat in pats:
        hits = page.search_for(pat)
        if hits:
            return hits[0]
    for b in page.get_text('blocks'):
        txt = b[4].replace(' ', '').replace('\u3000', '')
        if re.match(rf'問題{qnum}(\D|$)', txt) or re.match(rf'問題{fw}(\D|$)', txt):
            return fitz.Rect(b[:4])
    return None


def locate(doc, qnum):
    starts = []
    for pi, page in enumerate(doc):
        r = find_label(page, qnum)
        if r:
            # ignore cover false positives (問題40 on cover of some exams)
            if pi == 0 and qnum >= 40:
                # keep but prefer later
                starts.append((pi, r, True))
            else:
                starts.append((pi, r, False))
    # prefer non-cover
    real = [s for s in starts if not s[2]] or starts
    if not real:
        return None, None
    return real[0][0], real[0][1]


def clip_question(doc, qnum, dpi=DPI):
    """Return list of (page_index, clip_rect_in_pdf_points) and stitched PIL image."""
    pi, start = locate(doc, qnum)
    if start is None:
        return None
    pi_next, start_next = locate(doc, qnum + 1)
    page = doc[pi]
    page_w, page_h = page.rect.width, page.rect.height
    # left/right margins of content ~ 70-520 from earlier coords; use full content width
    x0 = max(50, start.x0 - 10)
    x1 = page_w - 40
    y0 = max(40, start.y0 - 6)

    clips = []
    if pi_next is not None and pi_next == pi:
        y1 = min(page_h - 30, start_next.y0 - 4)
        clips.append((pi, fitz.Rect(x0, y0, x1, y1)))
    elif pi_next is not None and pi_next > pi:
        # remainder of this page
        clips.append((pi, fitz.Rect(x0, y0, x1, page_h - 36)))
        # pages in between full content
        for mid in range(pi + 1, pi_next):
            mp = doc[mid]
            clips.append((mid, fitz.Rect(50, 50, mp.rect.width - 40, mp.rect.height - 36)))
        # top of next page until next question
        npage = doc[pi_next]
        clips.append((pi_next, fitz.Rect(50, 50, npage.rect.width - 40, start_next.y0 - 4)))
    else:
        # last question on last pages
        clips.append((pi, fitz.Rect(x0, y0, x1, page_h - 36)))

    # Render and stitch
    mats = []
    zoom = dpi / 72.0
    for cpi, rect in clips:
        if rect.height < 8:
            continue
        mat = fitz.Matrix(zoom, zoom)
        pix = doc[cpi].get_pixmap(matrix=mat, clip=rect, alpha=False)
        img = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
        mats.append((cpi, rect, img))
    if not mats:
        return None
    if len(mats) == 1:
        return {
            'parts': [{'page': mats[0][0] + 1, 'bbox_pts': [round(x, 2) for x in mats[0][1]]}, ],
            'image': mats[0][2],
        }
    total_h = sum(im.height for _, _, im in mats)
    max_w = max(im.width for _, _, im in mats)
    canvas = Image.new('RGB', (max_w, total_h), (255, 255, 255))
    y = 0
    parts = []
    for cpi, rect, im in mats:
        canvas.paste(im, (0, y))
        parts.append({'page': cpi + 1, 'bbox_pts': [round(x, 2) for x in rect], 'pixel_y0': y, 'pixel_h': im.height})
        y += im.height
    return {'parts': parts, 'image': canvas}


def crop_image_page(spec, dpi_src=200):
    pdf = f'/workspace/exams/{spec["pdf"]}'
    page_1based = spec['pdf_page']
    # render at high dpi with pymupdf then map 200dpi bbox
    doc = fitz.open(pdf)
    page = doc[page_1based - 1]
    zoom = DPI / 72.0
    pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
    full = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
    # scale bbox from 200dpi coords
    scale = DPI / dpi_src
    x0, y0, x1, y1 = [int(v * scale) for v in spec['pixel_bbox_200dpi']]
    x0 = max(0, x0); y0 = max(0, y0)
    x1 = min(full.width, x1); y1 = min(full.height, y1)
    crop = full.crop((x0, y0, x1, y1))
    # PDF point bbox equivalent
    page_h_pts = page.rect.height
    page_w_pts = page.rect.width
    # at DPI, pixel = pt * DPI/72
    def px_to_pt(px, axis='x'):
        return px * 72.0 / DPI
    bbox_pts = [
        round(px_to_pt(x0), 2),
        round(px_to_pt(y0), 2),
        round(px_to_pt(x1), 2),
        round(px_to_pt(y1), 2),
    ]
    return {
        'parts': [{'page': page_1based, 'bbox_pts': bbox_pts, 'pixel_bbox': [x0, y0, x1, y1], 'dpi': DPI}],
        'image': crop,
        'note': spec.get('note'),
    }


def main():
    qs = {q['id']: q for q in json.load(open(ROOT / 'public/data/questions.json'))}
    manifest = {'dpi': DPI, 'source_note': 'Crops from question PDFs only (f1/f3/f5/f7/f9). Answer keys are separate PDFs.', 'items': {}}

    for qid in NEED_IDS:
        q = qs[qid]
        set_id = q['set']
        out_path = OUT / f'{qid}.png'
        print(f'Cropping {qid}...')
        if qid in IMAGE_PAGE_CROPS:
            result = crop_image_page(IMAGE_PAGE_CROPS[qid])
        else:
            doc = fitz.open(PDFMAP[set_id])
            result = clip_question(doc, q['no'])
            doc.close()
        if not result:
            print(f'  FAILED {qid}')
            manifest['items'][qid] = {'status': 'failed'}
            continue
        result['image'].save(out_path, 'PNG', optimize=True)
        # also save a preview strip
        prev = result['image'].copy()
        prev.thumbnail((900, 1600))
        prev.save(OUT / f'{qid}_preview.png')
        manifest['items'][qid] = {
            'status': 'ok',
            'file': f'img/questions/{qid}.png',
            'preview': f'img/questions/{qid}_preview.png',
            'pdf': Path(PDFMAP[set_id]).name,
            'parts': result['parts'],
            'pixel_size': list(result['image'].size),
            'note': result.get('note') or 'Whole-question crop; options included; answer key not in source PDF',
            'contains_answer': False,
        }
        print(f'  saved {out_path.name} {result["image"].size} parts={result["parts"]}')

    MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    print('Wrote', MANIFEST_PATH)
    ok = sum(1 for v in manifest['items'].values() if v.get('status') == 'ok')
    print(f'Done {ok}/{len(NEED_IDS)}')


if __name__ == '__main__':
    main()
