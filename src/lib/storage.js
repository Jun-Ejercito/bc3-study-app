import { applyRating } from './scheduler.js';

const KEY = 'bc3-study-v1';

const defaultState = () => ({
  version: 1,
  cards: {},
  questions: {},
  daysTouched: {},
  settings: { lang: 'ja', overallOnlyLearned: true },
  exportedAt: null,
});

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultState();
    const data = JSON.parse(raw);
    if (!data || data.version !== 1) return defaultState();
    return { ...defaultState(), ...data, settings: { ...defaultState().settings, ...(data.settings || {}) } };
  } catch {
    return defaultState();
  }
}

export function saveState(state) {
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function exportJson(state) {
  const payload = { ...state, exportedAt: new Date().toISOString() };
  return JSON.stringify(payload, null, 2);
}

export function importJson(text) {
  const data = JSON.parse(text);
  if (!data || typeof data !== 'object') throw new Error('Invalid JSON');
  if (data.version !== 1) throw new Error('Unsupported backup version');
  const merged = { ...defaultState(), ...data };
  saveState(merged);
  return merged;
}

export function resetAll() {
  localStorage.removeItem(KEY);
  return defaultState();
}

export function touchDay(state, day) {
  const now = new Date().toISOString();
  const cur = state.daysTouched[day] || { first: now, last: now };
  state.daysTouched[day] = { first: cur.first || now, last: now };
}

export function recordCard(state, cardId, rating, day = null) {
  state.cards[cardId] = applyRating(state.cards[cardId], rating);
  if (day) touchDay(state, day);
  saveState(state);
  return state.cards[cardId];
}

export function recordQuestion(state, qid, choice, correctLetter, day = null) {
  const now = Date.now();
  const prev = state.questions[qid] || { attempts: 0, correct: 0, lastChoice: null, lastAt: 0, history: [] };
  const ok = choice === correctLetter;
  state.questions[qid] = {
    attempts: prev.attempts + 1,
    correct: prev.correct + (ok ? 1 : 0),
    lastChoice: choice,
    lastAt: now,
    lastCorrect: ok,
    history: [...(prev.history || []).slice(-49), { t: now, choice, ok }],
  };
  if (day) touchDay(state, day);
  saveState(state);
  return state.questions[qid];
}
