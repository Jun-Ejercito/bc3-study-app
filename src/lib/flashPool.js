/** Flashcard pool selection for main フラッシュカード screen (daily / overall / due). */

export const FLASH_MODES = ['daily', 'overall', 'due'];

export function resolveFlashParams(params = {}, settings = {}) {
  let mode = params.mode || settings.flashMode || 'overall';
  if (!FLASH_MODES.includes(mode)) mode = 'overall';
  let day = params.day ?? settings.flashDay ?? 1;
  day = Number(day);
  if (!Number.isFinite(day) || day < 1 || day > 30) day = 1;
  return { mode, day };
}

/** Cards for a calendar day — same IDs as the day lesson page. */
export function cardsForDay(data, day) {
  const d = data.dayByN?.[day] || data.days?.find((x) => x.day === day);
  if (!d) return [];
  let cards = (d.card_ids || []).map((id) => data.cardById?.[id]).filter(Boolean);
  if (!cards.length) {
    cards = (data.flashcards || []).filter((c) => c.day === day);
  }
  return cards;
}

/**
 * Eligible bank for the main flashcards screen.
 * - daily: that day's card_ids only (shared history with day page)
 * - overall: all cards; optional studied-days-only filter
 * - due: due/unseen from full bank (studied-days filter does not apply)
 */
export function selectFlashPool(data, state, { mode, day, onlyLearned, now = Date.now() } = {}) {
  if (mode === 'daily') return cardsForDay(data, day);

  let pool = data.flashcards || [];
  if (mode === 'overall' && onlyLearned) {
    const learned = new Set(Object.keys(state.daysTouched || {}).map(Number));
    if (learned.size) {
      pool = pool.filter((c) => c.day == null || learned.has(c.day));
    }
  }
  if (mode === 'due') {
    pool = pool.filter((c) => {
      const s = state.cards?.[c.id];
      return !s || (s.due || 0) <= now;
    });
  }
  return pool;
}

export function emptyFlashMessage(mode, { onlyLearned } = {}) {
  if (mode === 'daily') return 'この日に使えるカードがありません。';
  if (mode === 'due') return '今復習するカードはありません。';
  if (onlyLearned) {
    return '触った日のカードがありません。チェックを外すか、日別学習でカードに触れてください。';
  }
  return 'この条件に合うカードがありません。';
}

export function dayOptionLabel(d) {
  const n = String(d.day).padStart(2, '0');
  const theme = (d.theme || d.banner || d.kind || '').trim();
  const short = theme.length > 28 ? `${theme.slice(0, 28)}…` : theme;
  const kind =
    d.kind === 'review' ? '復習' : d.kind === 'mock' ? '模擬' : '学習';
  return short ? `Day${n} ${kind} · ${short}` : `Day${n} ${kind}`;
}
