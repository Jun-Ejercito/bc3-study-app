# Provenance

Bundled app data lives under `public/data/` and `public/img/` (mirrored into `dist/` on build). Recipients do not need the original authoring trees to run the app.

## Exam sets (labels)

| ID | Label | Question PDF | Answer key PDF |
|----|-------|--------------|----------------|
| R5後 | 令和5年度後期 | f1 | f2 |
| R6前 | 令和6年度前期 | f3 | f4 |
| R6後 | 令和6年度後期 | f5 | f6 |
| R7前 | 令和7年度前期 | f7 | f8 |
| R7後 | 令和7年度後期 | f9 | f10 |

## What shipped data was built from (maintainer reference)

| Asset in app | Origin (authoring machine) |
|--------------|----------------------------|
| Stems / choices | Parsed exam text/PDFs → `qs2.json` |
| Answers | Official 正解表 / `d_R*.txt`; R6前-32/33/34 confirmed on R6前 正解表 (f4) |
| JP explanations | DayNN 解説.docx via `scripts/extract_docx_text.py` (visible `w:t` + EQ ruby base only) |
| EN explanations | Per-set explanation modules |
| Day↔question map | `final.json` + day `qs.json` |
| Recall / OX / cloze / web maps | Day `content.py` → `flashcards.json` |
| 要点 | Textbook section notes → `yoten_sections.json` / embedded in `days.json` |
| Clusters | Concept rules → `clusters.json` (言い換え = 2+ real questions) |
| Furigana dict | Reviewed readings + compound overrides → `furigana.json` |
| Question images | Crops from question PDFs only; bbox in `image_manifest.json` (`contains_answer: false`) |

## Regenerating data (maintainer-only)

`npm run data` and `scripts/crop_questions.py` need the original external sources and Python packages. They are **optional** and not part of recipient startup.

## Runtime privacy

Progress is **localStorage** only. Export/import JSON from Settings. No accounts, no cloud sync, no student PII collection.
