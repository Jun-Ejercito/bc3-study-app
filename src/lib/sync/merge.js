/**
 * Append-only merge with UUID idempotency — multi-device without last-write-loss.
 * Never drop an accepted event; dedupe by event.id only.
 * Derived views (latest card/question state) prefer newest occurredAt but keep history.
 */

import { assertEventShape } from './events.js';

/**
 * @param {object[]} localEvents
 * @param {object[]} incomingEvents
 * @returns {{ events: object[], added: number, duplicates: number }}
 */
export function mergeEventLogs(localEvents = [], incomingEvents = []) {
  const byId = new Map();
  let duplicates = 0;
  for (const e of [...localEvents, ...incomingEvents]) {
    assertEventShape(e);
    if (byId.has(e.id)) {
      duplicates += 1;
      continue;
    }
    byId.set(e.id, e);
  }
  const events = [...byId.values()].sort((a, b) => {
    const ta = Date.parse(a.occurredAt);
    const tb = Date.parse(b.occurredAt);
    if (ta !== tb) return ta - tb;
    return a.id.localeCompare(b.id);
  });
  const localIds = new Set(localEvents.map((e) => e.id));
  const added = events.filter((e) => !localIds.has(e.id)).length;
  return { events, added, duplicates, total: events.length };
}

/** Idempotent upsert: returns whether the event was newly inserted. */
export function upsertEvent(log = [], evt) {
  assertEventShape(evt);
  if (log.some((e) => e.id === evt.id)) return { log, inserted: false };
  return { log: [...log, evt], inserted: true };
}

/**
 * Rebuild a local-style progress snapshot from events (for one student).
 * Quiz answers and card ratings accumulate; lesson_completed is a set of days.
 */
export function deriveProgressFromEvents(events, studentId) {
  const questions = {};
  const cards = {};
  const lessonsVisited = {};
  const lessonsCompleted = {};
  let lastActivityAt = null;

  const mine = (events || []).filter((e) => !studentId || e.studentId === studentId);
  for (const e of mine) {
    if (!lastActivityAt || e.occurredAt > lastActivityAt) lastActivityAt = e.occurredAt;
    if (e.type === 'quiz_answer') {
      const qid = e.payload.questionId;
      if (!qid) continue;
      const prev = questions[qid] || { attempts: 0, correct: 0, history: [] };
      questions[qid] = {
        attempts: prev.attempts + 1,
        correct: prev.correct + (e.payload.correct ? 1 : 0),
        lastChoice: e.payload.choice,
        lastAt: Date.parse(e.occurredAt),
        lastCorrect: !!e.payload.correct,
        history: [...prev.history, { t: Date.parse(e.occurredAt), choice: e.payload.choice, ok: !!e.payload.correct, eventId: e.id }],
      };
    } else if (e.type === 'card_rating') {
      const cid = e.payload.cardId;
      if (!cid) continue;
      const prev = cards[cid] || { reps: 0, history: [], lastRating: null };
      cards[cid] = {
        ...prev,
        reps: (prev.reps || 0) + 1,
        lastRating: e.payload.rating,
        last: Date.parse(e.occurredAt),
        history: [...(prev.history || []), { t: Date.parse(e.occurredAt), rating: e.payload.rating, eventId: e.id }],
      };
    } else if (e.type === 'lesson_visited') {
      const day = e.payload.day;
      const cur = lessonsVisited[day] || { first: e.occurredAt, last: e.occurredAt };
      lessonsVisited[day] = {
        first: cur.first < e.occurredAt ? cur.first : e.occurredAt,
        last: cur.last > e.occurredAt ? cur.last : e.occurredAt,
      };
    } else if (e.type === 'lesson_completed') {
      const day = e.payload.day;
      const prev = lessonsCompleted[day];
      if (!prev || e.occurredAt < prev) lessonsCompleted[day] = e.occurredAt;
    }
  }

  return { questions, cards, lessonsVisited, lessonsCompleted, lastActivityAt };
}
