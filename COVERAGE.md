# Coverage report (final)

## Verified complete

| Item | Count / status |
|------|----------------|
| Official exam questions | **200/200** unique (R5後·R6前·R6後·R7前·R7後 × 40) |
| Answers | **200/200** (R6前-32/33/34 from official 正解表 R6前; rest from answer keys) |
| JP explanations | **200/200** via OOXML `w:t` + EQ ruby bases (no Word field debris) |
| EN explanations | **200/200** |
| Day mapping | **200/200**; Day28=R7前 mock, Day29=R7後 mock |
| Diagram/table crops | **20** with page/bbox; **0** unavailable |
| 言い換え clusters | **43** (2+ source questions, named concepts) |
| Flashcards | **480** (incl. 4M multi-recall) |
| Review 要点 | Days **7 / 10 / 22 / 27 / 30** re-show earlier-day 要点 |
| Mock 要点 | Days **28 / 29** prep summary from Day1–27 |
| Scheduler | missed→1d; partial 1→3→7; all 1→3→7…; mastery cooldown |
| Automated tests | **30/30 pass** |
| Production `dist/` | included in delivery ZIP |
| Delivery ZIP | `/workspace/bc3-study-app-delivery.zip` |

## UI review fixes (included)

- Nav `[hidden]` → `display:none !important` + `aria-expanded`
- All 200 JP explanations re-extracted (R7後-26 regression covered)
- Review/mock 要点 render earlier topics; no internal filesystem paths in the student UI

## Gaps (honest)

- Furigana: dictionary + compound overrides; not claimed flawless
- R6前 p.11 is a scanned raster page — Q32–34 crops are from that image
- Minor qs2 vs PDF choice furigana line-break differences on two items (meaning intact)
- No cloud sync / no public deploy in this package
