/**
 * Flashcard priority & spacing (v1, tested):
 *
 * Ratings:
 *   - all     → interval 1 → 3 → 7 → 7*easiness… ; status mastered when interval>=7
 *   - partial → due in 1 day first miss-lite; if already on review track, 3 then 7
 *   - none    → due in 1 day (reset); after another miss stays at 1 until an all/partial
 *
 * Round selection:
 *   1. Unseen first
 *   2. Due missed/partial (by due date)
 *   3. Less practiced (fewer reps, lower easiness)
 *   4. No duplicate id in a round
 *   5. Avoid same variant_group until the round must fill
 *   6. Mastered cards respect cooldown (excluded until due)
 */

export const INTERVALS = { first: 1, second: 3, third: 7 };

export function nextInterval(prevInterval, rating) {
  const p = prevInterval || 0;
  if (rating === 'none') return INTERVALS.first; // 1 day
  if (rating === 'partial') {
    if (p <= 0) return INTERVALS.first;
    if (p < INTERVALS.second) return INTERVALS.second; // 1 → 3
    return INTERVALS.third; // 3+ → 7
  }
  // all
  if (p <= 0) return INTERVALS.first;
  if (p < INTERVALS.second) return INTERVALS.second;
  if (p < INTERVALS.third) return INTERVALS.third;
  return Math.max(INTERVALS.third, Math.round(p * 2.3));
}

export function applyRating(cardState, rating, now = Date.now()) {
  const prev = cardState || { status: 'new', easiness: 2.3, interval: 0, due: 0, reps: 0, last: 0, history: [] };
  let easiness = prev.easiness ?? 2.3;
  if (rating === 'all') easiness = Math.min(3.0, easiness + 0.15);
  else if (rating === 'partial') easiness = Math.max(1.3, easiness - 0.1);
  else easiness = Math.max(1.3, easiness - 0.25);

  const interval = nextInterval(prev.interval || 0, rating);
  const due = now + interval * 86400000;
  let status = 'learning';
  if (rating === 'none') status = 'missed';
  else if (rating === 'partial') status = 'partial';
  else if (interval >= INTERVALS.third) status = 'mastered';
  else status = 'learning';

  return {
    ...prev,
    status,
    easiness,
    interval,
    due,
    reps: (prev.reps || 0) + 1,
    last: now,
    lastRating: rating,
    history: [...(prev.history || []).slice(-49), { t: now, rating, interval }],
  };
}

export function isDue(cardState, now = Date.now()) {
  if (!cardState) return true;
  if (cardState.status === 'new') return true;
  return (cardState.due || 0) <= now;
}

export function isMastered(cardState) {
  return cardState && cardState.status === 'mastered' && (cardState.interval || 0) >= INTERVALS.third;
}

export function priorityScore(card, cardState, now = Date.now()) {
  if (!cardState) return 1000; // unseen
  const due = isDue(cardState, now);
  if (isMastered(cardState) && !due) return -10000;
  const dueBoost = due ? 500 : 0;
  const missBoost = cardState.lastRating === 'none' ? 220 : cardState.lastRating === 'partial' ? 120 : 0;
  const practice = Math.max(0, 50 - (cardState.reps || 0) * 5);
  const ease = (3 - (cardState.easiness || 2.3)) * 20;
  return dueBoost + missBoost + practice + ease;
}

export function buildRound(cards, stateMap, { limit = 20, now = Date.now(), excludeGroups = new Set() } = {}) {
  const scored = cards
    .map((c) => ({ c, s: stateMap[c.id], score: priorityScore(c, stateMap[c.id], now) }))
    .filter((x) => x.score > -5000);

  scored.sort((a, b) => b.score - a.score || a.c.id.localeCompare(b.c.id));

  const picked = [];
  const usedIds = new Set();
  const usedGroups = new Set(excludeGroups);

  for (const item of scored) {
    if (picked.length >= limit) break;
    const g = item.c.variant_group || item.c.id;
    if (usedIds.has(item.c.id) || usedGroups.has(g)) continue;
    picked.push(item.c);
    usedIds.add(item.c.id);
    usedGroups.add(g);
  }
  if (picked.length < limit) {
    for (const item of scored) {
      if (picked.length >= limit) break;
      if (usedIds.has(item.c.id)) continue;
      picked.push(item.c);
      usedIds.add(item.c.id);
    }
  }
  return picked;
}

export function orderForRound(cards, stateMap, now = Date.now()) {
  return buildRound(cards, stateMap, { limit: cards.length, now });
}
