/**
 * Scoped local progress store.
 * - Guest → key bc3-study-v1 only
 * - Signed-in → key bc3-study-acct:<uid> only (never writes guest key)
 * recordCard / recordQuestion / touchDay append sync events when signed in.
 */

import { applyRating } from './scheduler.js';
import {
  ANON_STORAGE_KEY,
  accountStorageKey,
  getSession,
} from './sync/accountScope.js';
import {
  eventFromCardRating,
  eventFromQuizAnswer,
  eventLessonVisited,
  eventLessonCompleted,
  assertEventShape,
} from './sync/events.js';
import { evaluateLessonCompletion } from './sync/lessonCompletion.js';
import { getOrCreateDeviceId } from './sync/accountScope.js';

/** @type {string|null} */
let activeStudentId = null;
/** Bumped on every account switch / logout to invalidate in-flight sync. */
let syncGeneration = 0;
/** Optional days catalog for completion checks (set from main after data load). */
let daysCatalogRef = null;
/** Optional flush scheduler hook (set by syncEngine). */
let flushScheduler = null;

export function getSyncGeneration() {
  return syncGeneration;
}

export function getActiveStudentId() {
  return activeStudentId;
}

export function setDaysCatalog(days) {
  daysCatalogRef = days || null;
}

export function setFlushScheduler(fn) {
  flushScheduler = typeof fn === 'function' ? fn : null;
}

/**
 * Switch active scope. Returns new generation.
 * Does not read/write storage itself — caller loads state after.
 */
export function setActiveStudentId(studentId) {
  const next = studentId || null;
  if (next && String(next).includes('@')) {
    throw new Error('refusing email as studentId');
  }
  activeStudentId = next;
  syncGeneration += 1;
  return syncGeneration;
}

export function currentStorageKey() {
  return activeStudentId ? accountStorageKey(activeStudentId) : ANON_STORAGE_KEY;
}

const defaultState = () => ({
  version: 1,
  cards: {},
  questions: {},
  daysTouched: {},
  lessonsCompleted: {},
  settings: { lang: 'ja', overallOnlyLearned: true },
  exportedAt: null,
  eventLog: [],
  pendingEventIds: [],
});

function normalizeState(data) {
  const base = defaultState();
  if (!data || data.version !== 1) return base;
  return {
    ...base,
    ...data,
    settings: { ...base.settings, ...(data.settings || {}) },
    eventLog: Array.isArray(data.eventLog) ? data.eventLog : [],
    pendingEventIds: Array.isArray(data.pendingEventIds) ? data.pendingEventIds : [],
    lessonsCompleted: data.lessonsCompleted || {},
  };
}

export function loadState() {
  try {
    const raw = localStorage.getItem(currentStorageKey());
    if (!raw) return defaultState();
    return normalizeState(JSON.parse(raw));
  } catch {
    return defaultState();
  }
}

/** Write ONLY the active scope key. Never cross-write guest ↔ account. */
export function saveState(state) {
  const key = currentStorageKey();
  localStorage.setItem(key, JSON.stringify(state));
}

export function exportJson(state) {
  const payload = { ...state, exportedAt: new Date().toISOString() };
  return JSON.stringify(payload, null, 2);
}

export function importJson(text) {
  const data = JSON.parse(text);
  if (!data || typeof data !== 'object') throw new Error('Invalid JSON');
  if (data.version !== 1) throw new Error('Unsupported backup version');
  const merged = normalizeState({ ...defaultState(), ...data });
  saveState(merged);
  return merged;
}

export function resetAll() {
  localStorage.removeItem(currentStorageKey());
  return defaultState();
}

function appendEvent(state, evt) {
  assertEventShape(evt);
  if (!state.eventLog) state.eventLog = [];
  if (!state.pendingEventIds) state.pendingEventIds = [];
  if (state.eventLog.some((e) => e.id === evt.id)) return;
  state.eventLog.push(evt);
  if (activeStudentId) {
    if (!state.pendingEventIds.includes(evt.id)) state.pendingEventIds.push(evt.id);
  }
}

function maybeFlush(state) {
  if (!activeStudentId || !flushScheduler) return;
  const gen = syncGeneration;
  const uid = activeStudentId;
  queueMicrotask(() => {
    try {
      flushScheduler({ state, generation: gen, studentId: uid });
    } catch {
      /* non-fatal */
    }
  });
}

function eventMeta() {
  return {
    studentId: activeStudentId,
    clientDeviceId: getOrCreateDeviceId(),
    classId: getSession(localStorage)?.classIdsCached?.[0] || null,
  };
}

export function touchDay(state, day) {
  const now = new Date().toISOString();
  const cur = state.daysTouched[day] || { first: now, last: now };
  state.daysTouched[day] = { first: cur.first || now, last: now };
  if (activeStudentId) {
    appendEvent(state, eventLessonVisited({ ...eventMeta(), day, occurredAt: now }));
  }
}

export function recordCard(state, cardId, rating, day = null) {
  const now = Date.now();
  state.cards[cardId] = applyRating(state.cards[cardId], rating, now);
  if (day != null) touchDay(state, day);
  if (activeStudentId) {
    appendEvent(
      state,
      eventFromCardRating({
        ...eventMeta(),
        cardId,
        rating,
        day,
        occurredAt: new Date(now).toISOString(),
      }),
    );
    maybeCompleteLesson(state, day);
  }
  saveState(state);
  maybeFlush(state);
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
  if (day != null) touchDay(state, day);
  if (activeStudentId) {
    appendEvent(
      state,
      eventFromQuizAnswer({
        ...eventMeta(),
        questionId: qid,
        choice,
        correctLetter,
        day,
        occurredAt: new Date(now).toISOString(),
      }),
    );
    maybeCompleteLesson(state, day);
  }
  saveState(state);
  maybeFlush(state);
  return state.questions[qid];
}

function maybeCompleteLesson(state, day) {
  if (day == null || !daysCatalogRef) return;
  const meta = daysCatalogRef.find((d) => d.day === Number(day));
  if (!meta) return;
  if (state.lessonsCompleted?.[day]) return;
  const ev = evaluateLessonCompletion(meta, state);
  if (!ev.complete) return;
  const iso = new Date().toISOString();
  state.lessonsCompleted = { ...(state.lessonsCompleted || {}), [day]: iso };
  appendEvent(
    state,
    eventLessonCompleted({
      ...eventMeta(),
      day: Number(day),
      criteria: 'default_v1',
      occurredAt: iso,
    }),
  );
}

/** Test helpers */
export function _defaultStateForTests() {
  return defaultState();
}
