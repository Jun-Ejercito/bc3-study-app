# BC3 Study App (local v1)

Standalone mobile-first web app for **ビジネス・キャリア検定 3級 生産管理オペレーション**.

## Scope (verified)

- **Five official exams only:** 令和5年度後期 (R5後), 令和6年度前期 (R6前), 令和6年度後期 (R6後), 令和7年度前期 (R7前), 令和7年度後期 (R7後) = **200 questions**.
- Day01–Day30 study path (lessons, ミニテスト, 思い出しワーク, flashcards).
- **20** diagram/table question crops (page/bbox in `public/data/image_manifest.json`); **0** unavailable.
- Review days (7 / 10 / 22 / 27 / 30) and mock days (28 / 29) re-show earlier **要点** (not blank).
- Past exams: four views (set / day / chapter / 言い換え cluster) with **shared local history by question id**.
- **LocalStorage only** — export/import JSON for backup. No accounts, no cloud sync, no student PII.

## Live site (public)

- Repository: https://github.com/Jun-Ejercito/bc3-study-app
- Pages: https://jun-ejercito.github.io/bc3-study-app/
- Exam content is public on the internet (owner-authorized). See `NOTICE.md`.

## Run (recipient)

Prebuilt data (`public/data/`), images (`public/img/`), and production bundle (`dist/`) are included. You do **not** need original exam PDFs or Python to start.

```bash
cd bc3-study-app
npm install
npm test
npm run dev
# → http://127.0.0.1:5173/
```

### Use the prebuilt production build

```bash
npm run preview -- --host 0.0.0.0
# → http://0.0.0.0:5173/  (or http://127.0.0.1:5173/)
```

`dist/` is already built; preview serves it. Rebuild only if you change source: `npm run build`.

## Maintainer-only (optional)

`npm run data` regenerates `public/data/*` from external source trees (exam PDFs/text, Day 解説 docx, mapping JSON, etc.) and needs those files plus Python deps (`lxml`, etc.). **Not required** for normal install / test / run.

Image re-crop: `scripts/crop_questions.py` (PyMuPDF; same external PDFs).

## Data & provenance

- Bundled JSON: `public/data/` (also copied into `dist/data/` on build).
- Manifest: `public/data/manifest.json`
- Image bbox manifest: `public/data/image_manifest.json`
- Human notes: `PROVENANCE.md`, `COVERAGE.md`

## Tests

```bash
npm test
# 30 tests — integrity, clean JP explanations (R7後-26), images, scheduler 1/3/7, review 要点, nav CSS
```

## Known gaps (honest)

- UI furigana uses a reviewed dictionary + compound overrides; not claimed flawless.
- R6前 questions 32–34 sit on a scanned raster PDF page; crops are from that image.
- No cloud sync / no public deployment in this package.
