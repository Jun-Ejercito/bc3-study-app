import { applyRating } from '../scheduler.js';
import { evaluateLessonCompletion } from './lessonCompletion.js';

/**
 * Rebuild cards / questions / daysTouched from an append-only event log.
 * Card ratings replay through applyRating for accurate SRS fields.
 */
export function rebuildProgressFromEvents(events, studentId, { daysCatalog = [], settings = null } = {}) {
  const cards = {};
  const questions = {};
  const daysTouched = {};
  const lessonsCompleted = {};
  let lastActivityAt = null;

  const mine = (events || [])
    .filter((e) => !studentId || e.studentId === studentId || e.studentId == null)
    .slice()
    .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt) || a.id.localeCompare(b.id));

  for (const e of mine) {
    if (!lastActivityAt || e.occurredAt > lastActivityAt) lastActivityAt = e.occurredAt;
    const t = Date.parse(e.occurredAt);

    if (e.type === 'card_rating') {
      const cid = e.payload?.cardId;
      if (!cid) continue;
      cards[cid] = applyRating(cards[cid], e.payload.rating, t);
      const day = e.payload?.day;
      if (day != null) touch(daysTouched, day, e.occurredAt);
    } else if (e.type === 'quiz_answer') {
      const qid = e.payload?.questionId;
      if (!qid) continue;
      const prev = questions[qid] || { attempts: 0, correct: 0, history: [] };
      const ok = !!e.payload.correct;
      questions[qid] = {
        attempts: prev.attempts + 1,
        correct: prev.correct + (ok ? 1 : 0),
        lastChoice: e.payload.choice,
        lastAt: t,
        lastCorrect: ok,
        history: [...(prev.history || []).slice(-49), { t, choice: e.payload.choice, ok, eventId: e.id }],
      };
      const day = e.payload.day;
      if (day != null) touch(daysTouched, day, e.occurredAt);
    } else if (e.type === 'lesson_visited') {
      const day = e.payload?.day;
      if (day != null) touch(daysTouched, day, e.occurredAt);
    } else if (e.type === 'lesson_completed') {
      const day = e.payload?.day;
      if (day != null) {
        if (!lessonsCompleted[day] || e.occurredAt < lessonsCompleted[day]) {
          lessonsCompleted[day] = e.occurredAt;
        }
      }
    }
  }

  // Derive completion for catalog days when criteria met but no explicit event
  for (const day of daysCatalog) {
    const ev = evaluateLessonCompletion(day, { questions, cards });
    if (ev.complete && !lessonsCompleted[day.day]) {
      lessonsCompleted[day.day] = lastActivityAt || new Date().toISOString();
    }
  }

  return {
    version: 1,
    cards,
    questions,
    daysTouched,
    lessonsCompleted,
    lastActivityAt,
    settings: settings || { lang: 'ja', overallOnlyLearned: true },
    exportedAt: null,
  };
}

function touch(map, day, iso) {
  const cur = map[day] || { first: iso, last: iso };
  map[day] = {
    first: cur.first <= iso ? cur.first : iso,
    last: cur.last >= iso ? cur.last : iso,
  };
}
