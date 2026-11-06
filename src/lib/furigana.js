/** Longest-match furigana from reviewed dictionary. Not claimed flawless. */
const KANJI = /[\u4E00-\u9FFF々〆ヵヶ]/;

export function applyFurigana(text, dict) {
  if (!text) return '';
  if (!dict) return escapeHtml(text);
  const keys = Object.keys(dict).sort((a, b) => b.length - a.length);
  let i = 0;
  let out = '';
  while (i < text.length) {
    let matched = null;
    for (const k of keys) {
      if (k && text.startsWith(k, i) && KANJI.test(k)) {
        matched = k;
        break;
      }
    }
    if (matched) {
      const yomi = dict[matched];
      out += `<ruby>${escapeHtml(matched)}<rp>(</rp><rt>${escapeHtml(yomi)}</rt><rp>)</rp></ruby>`;
      i += matched.length;
    } else {
      out += escapeHtml(text[i]);
      i += 1;
    }
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
