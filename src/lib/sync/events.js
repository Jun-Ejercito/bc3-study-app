/**
 * Provider-neutral progress event schema (append-only).
 * Events are the source of truth for multi-device sync; derived maps are rebuildable.
 *
 * Security: studentId / classId must be stable auth UIDs from the provider —
 * never email addresses or URL query params as identity.
 */

import { nowUtcIso } from './time.js';

export const EVENT_SCHEMA_VERSION = 1;

/** @typedef {'lesson_visited'|'lesson_completed'|'quiz_answer'|'card_rating'|'explicit_import'} ProgressEventType */

export const EVENT_TYPES = Object.freeze([
  'lesson_visited',
  'lesson_completed',
  'quiz_answer',
  'card_rating',
  'explicit_import',
]);

function newId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for constrained runtimes — still unique enough for idempotency keys
  return `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * @param {object} partial
 * @param {ProgressEventType} partial.type
 * @param {string} partial.studentId  auth UID (required for syncable events)
 * @param {string} [partial.classId]
 * @param {object} [partial.payload]
 * @param {string} [partial.occurredAt] UTC ISO
 * @param {string} [partial.id] client UUID for offline idempotency
 */
export function createProgressEvent(partial) {
  if (!partial || !EVENT_TYPES.includes(partial.type)) {
    throw new Error(`invalid event type: ${partial?.type}`);
  }
  if (partial.type !== 'explicit_import' && !partial.studentId) {
    // Anonymous local-only may omit studentId; sync adapter must reject unsigned events
  }
  const occurredAt = partial.occurredAt || nowUtcIso();
  if (!/^\d{4}-\d{2}-\d{2}T/.test(occurredAt) || !occurredAt.endsWith('Z') && !/[+-]\d{2}:\d{2}$/.test(occurredAt)) {
    // Prefer Zulu; allow offset forms but normalize below
  }
  const iso = new Date(occurredAt).toISOString(); // normalize to UTC Z
  return Object.freeze({
    schemaVersion: EVENT_SCHEMA_VERSION,
    id: partial.id || newId(),
    type: partial.type,
    studentId: partial.studentId || null,
    classId: partial.classId || null,
    occurredAt: iso,
    clientDeviceId: partial.clientDeviceId || null,
    payload: Object.freeze({ ...(partial.payload || {}) }),
  });
}

export function assertEventShape(evt) {
  if (!evt || evt.schemaVersion !== EVENT_SCHEMA_VERSION) throw new Error('bad schemaVersion');
  if (!evt.id || typeof evt.id !== 'string') throw new Error('missing id');
  if (!EVENT_TYPES.includes(evt.type)) throw new Error('bad type');
  if (!evt.occurredAt || Number.isNaN(Date.parse(evt.occurredAt))) throw new Error('bad occurredAt');
  if (evt.payload == null || typeof evt.payload !== 'object') throw new Error('bad payload');
  return true;
}

/** Map current local storage actions → sync events (hooks; not wired yet). */
export function eventFromQuizAnswer({ studentId, classId, questionId, choice, correctLetter, day, occurredAt, clientDeviceId }) {
  const ok = choice === correctLetter;
  return createProgressEvent({
    type: 'quiz_answer',
    studentId,
    classId,
    occurredAt,
    clientDeviceId,
    payload: {
      questionId,
      choice,
      correct: ok,
      day: day ?? null,
      // Practice bank — not a proctored exam claim
      practiceOnly: true,
    },
  });
}

export function eventFromCardRating({ studentId, classId, cardId, rating, day, occurredAt, clientDeviceId }) {
  return createProgressEvent({
    type: 'card_rating',
    studentId,
    classId,
    occurredAt,
    clientDeviceId,
    payload: { cardId, rating, day: day ?? null, selfRated: true },
  });
}

export function eventLessonVisited({ studentId, classId, day, occurredAt, clientDeviceId }) {
  return createProgressEvent({
    type: 'lesson_visited',
    studentId,
    classId,
    occurredAt,
    clientDeviceId,
    payload: { day },
  });
}

export function eventLessonCompleted({ studentId, classId, day, criteria, occurredAt, clientDeviceId }) {
  return createProgressEvent({
    type: 'lesson_completed',
    studentId,
    classId,
    occurredAt,
    clientDeviceId,
    payload: { day, criteria: criteria || null },
  });
}
