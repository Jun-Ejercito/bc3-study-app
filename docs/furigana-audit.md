# Furigana audit log (BC3 study app)

Date: 2026-11-06 (Asia/Tokyo)  
Scope: reading markup / dictionary / render rules only — **exam wording unchanged**.  
Method: longest dictionary match + okurigana kunyomi rules + bare-noun context for 数; COMP compound overrides.  
**Not claimed perfect** for every ambiguous kanji in the corpus.

## Corpus counts (Japanese strings with kanji)

| File | Strings (with kanji) |
|------|----------------------|
| questions.json | 3735 |
| flashcards.json | 2494 |
| yoten_sections.json | 754 |
| days.json | 4848 |
| sets.json | 20 |
| clusters.json | 404 |
| **Unique strings** | **4398** |
| Dictionary keys (furigana.json) | 2633 |

## Screenshot / regression sentence (rendered)

```
不適合品の数のように数えて得られる値を（　）、長さや重さのように測って得られる値を（　）という。
```

HTML (rt text):
```html
<ruby>不適合品<rp>(</rp><rt>ふてきごうひん</rt><rp>)</rp></ruby>の<ruby>数<rp>(</rp><rt>かず</rt><rp>)</rp></ruby>のように<ruby>数<rp>(</rp><rt>かぞ</rt><rp>)</rp></ruby>えて<ruby>得<rp>(</rp><rt>え</rt><rp>)</rp></ruby>られる<ruby>値<rp>(</rp><rt>あたい</rt><rp>)</rp></ruby>を（　）、<ruby>長さ<rp>(</rp><rt>ながさ</rt><rp>)</rp></ruby>や<ruby>重さ<rp>(</rp><rt>おもさ</rt><rp>)</rp></ruby>のように<ruby>測<rp>(</rp><rt>はか</rt><rp>)</rp></ruby>って<ruby>得<rp>(</rp><rt>え</rt><rp>)</rp></ruby>られる<ruby>値<rp>(</rp><rt>あたい</rt><rp>)</rp></ruby>を（　）という。
```

Expected: 不適合品→ふてきごうひん, 数→かず, 数→かぞ + えて, 長さ→ながさ, 重さ→おもさ, 測→はか + って, 値→あたい.

## Corrected readings (before → after)

| Item | Before | After |
|------|--------|-------|
| 数 (noun / の数) | すう | かず (context BARE_NOUN) |
| 数えて / 数える | すう + えて | かぞ + えて (okurigana) |
| 実績値 | じっせき+あたい | じっせきち (COMP) |
| 不良品 | ふりょう+ひん | ふりょうひん (COMP) |
| 指数 | ゆび+すう | しすう (COMP) |
| 図示 | ず+しめ | ずし (COMP) |
| 図る | ず+る | はか+る (okurigana) |
| 長さ / 重さ | 長+さ / 重+さ (ok) | ながさ / おもさ whole-word COMP |
| 測って | はか+って | unchanged (okurigana/dict) |
| 個数/計数/数量/数値/多数/数式… | すう compounds | unchanged longest-match |

## Focus renders

- `実績値` → <ruby>実績値<rp>(</rp><rt>じっせきち</rt><rp>)</rp></ruby>
- `標準値と実績値を比較する` → <ruby>標準<rp>(</rp><rt>ひょうじゅん</rt><rp>)</rp></ruby><ruby>値<rp>(</rp><rt>あたい</rt><rp>)</rp></ruby>と<ruby>実績値<rp>(</rp><rt>じっせきち</rt><rp>)</rp></ruby>を<ruby>比較<rp>(</rp><rt>ひかく</rt><rp>)</rp></ruby>する
- `数えて` → <ruby>数<rp>(</rp><rt>かぞ</rt><rp>)</rp></ruby>えて
- `数える` → <ruby>数<rp>(</rp><rt>かぞ</rt><rp>)</rp></ruby>える
- `の数` → の<ruby>数<rp>(</rp><rt>かず</rt><rp>)</rp></ruby>
- `個数` → <ruby>個数<rp>(</rp><rt>こすう</rt><rp>)</rp></ruby>
- `計数値` → <ruby>計数値<rp>(</rp><rt>けいすうち</rt><rp>)</rp></ruby>
- `数量` → <ruby>数量<rp>(</rp><rt>すうりょう</rt><rp>)</rp></ruby>
- `数値` → <ruby>数値<rp>(</rp><rt>すうち</rt><rp>)</rp></ruby>
- `多数` → <ruby>多数<rp>(</rp><rt>たすう</rt><rp>)</rp></ruby>
- `数式` → <ruby>数式<rp>(</rp><rt>すうしき</rt><rp>)</rp></ruby>
- `指数` → <ruby>指数<rp>(</rp><rt>しすう</rt><rp>)</rp></ruby>
- `測って` → <ruby>測<rp>(</rp><rt>はか</rt><rp>)</rp></ruby>って
- `図る` → <ruby>図<rp>(</rp><rt>はか</rt><rp>)</rp></ruby>る
- `図示` → <ruby>図示<rp>(</rp><rt>ずし</rt><rp>)</rp></ruby>
- `不良品` → <ruby>不良品<rp>(</rp><rt>ふりょうひん</rt><rp>)</rp></ruby>
- `不適合品` → <ruby>不適合品<rp>(</rp><rt>ふてきごうひん</rt><rp>)</rp></ruby>
- `良品` → <ruby>良品<rp>(</rp><rt>りょうひん</rt><rp>)</rp></ruby>
- `長さ` → <ruby>長さ<rp>(</rp><rt>ながさ</rt><rp>)</rp></ruby>
- `重さ` → <ruby>重さ<rp>(</rp><rt>おもさ</rt><rp>)</rp></ruby>
- `適合品数÷検査数` → <ruby>適合品数<rp>(</rp><rt>てきごうひんすう</rt><rp>)</rp></ruby>÷<ruby>検査数<rp>(</rp><rt>けんさすう</rt><rp>)</rp></ruby>
- `労働者数` → <ruby>労働者数<rp>(</rp><rt>ろうどうしゃすう</rt><rp>)</rp></ruby>
- `値` → <ruby>値<rp>(</rp><rt>あたい</rt><rp>)</rp></ruby>

## Heuristic flags after fix

_None of the critical heuristics fired (数える/の数/図る)._

## Unresolved / remaining limits

- Generic longest-match remains for 500+ single-kanji entries; only audited high-frequency / user-reported / technical compounds listed above.
- Katakana+数 (データ数・サンプル数) uses suffix すう via after-word-char rule; reading is conventional but not individually dictionary-verified for every nonce form.
- 目盛の数 / 示す数 / 階級の数 / 項目の数 → かず via BARE_NOUN (particle/noun contexts).
- 計って does not appear as a verb in this corpus; okuri rule ready if it appears.
- Rendaku inside unlisted multi-kanji compounds may still be wrong where no COMP/dict entry exists.
- 階級 → かいきゅう and 観測数 → かんそくすう added in this pass; other rare X数 forms rely on suffix すう rule.
- Curly-brace cloze markers {計数値} in day texts are left as surface text; readings apply to inner kanji only when braces stripped by display — verify UI path.

## Rule summary (src/lib/furigana.js)

1. Skip if string already contains `<ruby` / `<rt` (no double annotation).
2. Okurigana rules first for 数/図/測/計 when followed by matching kana.
3. Longest `furigana.json` match (COMP merged at build).
4. Bare 数 → かず unless preceded by kanji/katakana/latin (then dict すう suffix).
5. HTML-escape base text and readings.

## Prior fix preserved

- 実績値 → じっせきち (COMP); standalone 値 → あたい.
