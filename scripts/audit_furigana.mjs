#!/usr/bin/env node
/**
 * Furigana corpus audit — renders every JP string via applyFurigana.
 * Writes docs/furigana-audit.md (no private info).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { applyFurigana } from '../src/lib/furigana.js';

const dict = JSON.parse(readFileSync('public/data/furigana.json', 'utf8'));
const files = [
  'questions.json', 'flashcards.json', 'yoten_sections.json',
  'days.json', 'sets.json', 'clusters.json',
];

function walk(o, acc, skipEn = true) {
  if (typeof o === 'string') {
    if (/[\u4E00-\u9FFF]/.test(o)) acc.push(o);
  } else if (Array.isArray(o)) o.forEach((x) => walk(x, acc, skipEn));
  else if (o && typeof o === 'object') {
    for (const [k, v] of Object.entries(o)) {
      if (skipEn && (/_en$/i.test(k) || k === 'label_en' || k === 'prompt_en' || k === 'explanation_en')) continue;
      walk(v, acc, skipEn);
    }
  }
}

const byFile = {};
let all = [];
for (const f of files) {
  const data = JSON.parse(readFileSync(`public/data/${f}`, 'utf8'));
  const acc = [];
  walk(data, acc);
  byFile[f] = acc;
  all = all.concat(acc);
}
const unique = [...new Set(all)];

// Known-good regressions to record
const focus = [
  '不適合品の数のように数えて得られる値を（　）、長さや重さのように測って得られる値を（　）という。',
  '実績値',
  '標準値と実績値を比較する',
  '数えて',
  '数える',
  'の数',
  '個数',
  '計数値',
  '数量',
  '数値',
  '多数',
  '数式',
  '指数',
  '測って',
  '図る',
  '図示',
  '不良品',
  '不適合品',
  '良品',
  '長さ',
  '重さ',
  '適合品数÷検査数',
  '労働者数',
  '値',
];

const corrections = [
  { word: '数 (noun / の数)', before: 'すう', after: 'かず (context BARE_NOUN)' },
  { word: '数えて / 数える', before: 'すう + えて', after: 'かぞ + えて (okurigana)' },
  { word: '実績値', before: 'じっせき+あたい', after: 'じっせきち (COMP)' },
  { word: '不良品', before: 'ふりょう+ひん', after: 'ふりょうひん (COMP)' },
  { word: '指数', before: 'ゆび+すう', after: 'しすう (COMP)' },
  { word: '図示', before: 'ず+しめ', after: 'ずし (COMP)' },
  { word: '図る', before: 'ず+る', after: 'はか+る (okurigana)' },
  { word: '長さ / 重さ', before: '長+さ / 重+さ (ok)', after: 'ながさ / おもさ whole-word COMP' },
  { word: '測って', before: 'はか+って', after: 'unchanged (okurigana/dict)' },
  { word: '個数/計数/数量/数値/多数/数式…', before: 'すう compounds', after: 'unchanged longest-match' },
];

// Heuristic flags on rendered HTML
const flags = [];
const suspiciousRt = [];
for (const s of unique) {
  const html = applyFurigana(s, dict);
  // Flag: 数 with すう immediately before hiragana え (should be impossible now)
  if (/数[^<]*<rt>すう<\/rt>.*えて|数<[^>]+><rp>\(<\/rp><rt>すう<\/rt>/.test(html) && /数えて|数える|数えた/.test(s)) {
    if (/<ruby>数<rp>\(<\/rp><rt>すう<\/rt>/.test(html) && /数え/.test(s)) {
      flags.push({ kind: '数える_still_suu', sample: s.slice(0, 60) });
    }
  }
  // 図る still ず
  if (/図る/.test(s) && /<ruby>図<rp>\(<\/rp><rt>ず<\/rt>/.test(html)) {
    flags.push({ kind: '図る_still_zu', sample: s.slice(0, 60) });
  }
  // bare の数 still すう
  if (/の数/.test(s) && /の<ruby>数<rp>\(<\/rp><rt>すう<\/rt>/.test(html)) {
    flags.push({ kind: 'no_kazu_still_suu', sample: s.slice(0, 60) });
  }
}

// Remaining ambiguous: single-kanji dict hits that are common and unverified
const ambiguousNotes = [
  'Generic longest-match remains for 500+ single-kanji entries; only audited high-frequency / user-reported / technical compounds listed above.',
  'Katakana+数 (データ数・サンプル数) uses suffix すう via after-word-char rule; reading is conventional but not individually dictionary-verified for every nonce form.',
  '目盛の数 / 示す数 / 階級の数 / 項目の数 → かず via BARE_NOUN (particle/noun contexts).',
  '計って does not appear as a verb in this corpus; okuri rule ready if it appears.',
  'Rendaku inside unlisted multi-kanji compounds may still be wrong where no COMP/dict entry exists.',
  'Curly-brace cloze markers {計数値} in day texts are left as surface text; readings apply to inner kanji only when braces stripped by display — verify UI path.',
];

// Counts
const focusRenders = focus.map((s) => ({ s, html: applyFurigana(s, dict) }));

let md = `# Furigana audit log (BC3 study app)

Date: 2026-11-06 (Asia/Tokyo)  
Scope: reading markup / dictionary / render rules only — **exam wording unchanged**.  
Method: longest dictionary match + okurigana kunyomi rules + bare-noun context for 数; COMP compound overrides.  
**Not claimed perfect** for every ambiguous kanji in the corpus.

## Corpus counts (Japanese strings with kanji)

| File | Strings (with kanji) |
|------|----------------------|
${files.map((f) => `| ${f} | ${byFile[f].length} |`).join('\n')}
| **Unique strings** | **${unique.length}** |
| Dictionary keys (furigana.json) | ${Object.keys(dict).length} |

## Screenshot / regression sentence (rendered)

\`\`\`
${focusRenders[0].s}
\`\`\`

HTML (rt text):
\`\`\`html
${focusRenders[0].html}
\`\`\`

Expected: 不適合品→ふてきごうひん, 数→かず, 数→かぞ + えて, 長さ→ながさ, 重さ→おもさ, 測→はか + って, 値→あたい.

## Corrected readings (before → after)

| Item | Before | After |
|------|--------|-------|
${corrections.map((c) => `| ${c.word} | ${c.before} | ${c.after} |`).join('\n')}

## Focus renders

${focusRenders.slice(1).map((r) => `- \`${r.s}\` → ${r.html.replace(/\n/g, '')}`).join('\n')}

## Heuristic flags after fix

${flags.length ? flags.slice(0, 30).map((f) => `- **${f.kind}**: ${f.sample}`).join('\n') : '_None of the critical heuristics fired (数える/の数/図る)._'}

## Unresolved / remaining limits

${ambiguousNotes.map((n) => `- ${n}`).join('\n')}

## Rule summary (src/lib/furigana.js)

1. Skip if string already contains \`<ruby\` / \`<rt\` (no double annotation).
2. Okurigana rules first for 数/図/測/計 when followed by matching kana.
3. Longest \`furigana.json\` match (COMP merged at build).
4. Bare 数 → かず unless preceded by kanji/katakana/latin (then dict すう suffix).
5. HTML-escape base text and readings.

## Prior fix preserved

- 実績値 → じっせきち (COMP); standalone 値 → あたい.
`;

mkdirSync('docs', { recursive: true });
writeFileSync('docs/furigana-audit.md', md, 'utf8');
writeFileSync('docs/furigana-audit-focus.json', JSON.stringify({ unique: unique.length, byFile: Object.fromEntries(files.map(f=>[f,byFile[f].length])), focusRenders, flags }, null, 2), 'utf8');
console.log('unique', unique.length);
console.log('flags', flags.length);
console.log('wrote docs/furigana-audit.md');
