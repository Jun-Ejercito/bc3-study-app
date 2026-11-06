/** Longest-match furigana + okurigana / bare-kanji context rules. Not claimed flawless. */

const KANJI = /[\u4E00-\u9FFF々〆ヵヶ]/;
const HIRAGANA = /[ぁ-ゖゝゞー]/;
const KATAKANA = /[ァ-ヺー]/;
const LATIN_NUM = /[A-Za-z0-9０-９]/;

/**
 * When these kanji are followed by matching okurigana, annotate kanji only
 * with the kunyomi stem (okurigana stays outside <rt> — no duplicate kana).
 */
const OKURI_RULES = [
  { kanji: '数', okuri: /^え/, yomi: 'かぞ' }, // 数える・えて・えた…
  { kanji: '図', okuri: /^[らりるれろっ]/, yomi: 'はか' }, // 図る・って（向上を図る）
  { kanji: '測', okuri: /^[らりるれろっ]/, yomi: 'はか' }, // 測る・って
  { kanji: '計', okuri: /^[らりるれろっ]/, yomi: 'はか' }, // 計る・って
];

/** Bare noun readings when not in a longer compound and not okurigana. */
const BARE_NOUN = {
  数: 'かず', // の数・数のように — not onyomi すう
};

function isWordCharBefore(ch) {
  if (!ch) return false;
  return KANJI.test(ch) || KATAKANA.test(ch) || LATIN_NUM.test(ch);
}

function ruby(kanji, yomi) {
  return `<ruby>${escapeHtml(kanji)}<rp>(</rp><rt>${escapeHtml(yomi)}</rt><rp>)</rp></ruby>`;
}

function findOkuriRule(ch, rest) {
  for (const rule of OKURI_RULES) {
    if (rule.kanji === ch && rule.okuri.test(rest)) return rule;
  }
  return null;
}

export function applyFurigana(text, dict) {
  if (!text) return '';
  // Already annotated — do not double-wrap
  if (/<ruby[\s>]/i.test(text) || /<rt[\s>]/i.test(text)) {
    return String(text);
  }
  if (!dict) return escapeHtml(text);

  const keys = Object.keys(dict)
    .filter((k) => k && KANJI.test(k))
    .sort((a, b) => b.length - a.length);

  let i = 0;
  let out = '';
  while (i < text.length) {
    const rest = text.slice(i);
    const ch = text[i];

    // 1) Okurigana kunyomi takes precedence over a bare onyomi dict hit
    const okuri = findOkuriRule(ch, text.slice(i + 1));
    if (okuri) {
      out += ruby(okuri.kanji, okuri.yomi);
      i += okuri.kanji.length;
      continue;
    }

    // 2) Longest dictionary match
    let matched = null;
    for (const k of keys) {
      if (rest.startsWith(k)) {
        matched = k;
        break;
      }
    }

    if (matched) {
      // If dict matched only the ambiguous kanji and a bare-noun rule applies, use it
      if (matched.length === 1 && BARE_NOUN[matched]) {
        const prev = i > 0 ? text[i - 1] : '';
        // X数 suffix (after kanji/katakana/latin) keeps onyomi すう from dict
        if (!isWordCharBefore(prev)) {
          out += ruby(matched, BARE_NOUN[matched]);
          i += 1;
          continue;
        }
      }
      out += ruby(matched, dict[matched]);
      i += matched.length;
      continue;
    }

    out += escapeHtml(ch);
    i += 1;
  }
  return out;
}

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Exported for tests / audit tooling */
export const FURIGANA_RULES = { OKURI_RULES, BARE_NOUN };
