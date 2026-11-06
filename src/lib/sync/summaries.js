/**
 * Student / class summary builders for a future teacher dashboard.
 * Pure functions over events + day catalog — no network, no sample students.
 */

import { deriveProgressFromEvents } from './merge.js';
import { evaluateLessonCompletion } from './lessonCompletion.js';
import { formatJst } from './time.js';

/**
 * @param {object[]} events
 * @param {string} studentId
 * @param {object[]} daysCatalog data.days
 */
export function buildStudentSummary(events, studentId, daysCatalog = []) {
  if (!studentId) throw new Error('studentId required (auth UID)');
  const derived = deriveProgressFromEvents(events, studentId);
  const visitedDays = Object.keys(derived.lessonsVisited).map(Number).sort((a, b) => a - b);
  const completedFromEvents = Object.keys(derived.lessonsCompleted).map(Number).sort((a, b) => a - b);

  // Also compute completion from derived quiz/card maps (may be ahead of explicit events)
  const computedComplete = [];
  for (const day of daysCatalog) {
    const ev = evaluateLessonCompletion(day, derived);
    if (ev.complete) computedComplete.push(day.day);
  }

  let quizAttempts = 0;
  let quizCorrect = 0;
  for (const q of Object.values(derived.questions)) {
    quizAttempts += q.attempts || 0;
    quizCorrect += q.correct || 0;
  }
  let cardRatings = 0;
  const ratingCounts = { all: 0, partial: 0, none: 0 };
  for (const c of Object.values(derived.cards)) {
    cardRatings += c.reps || 0;
    for (const h of c.history || []) {
      if (ratingCounts[h.rating] != null) ratingCounts[h.rating] += 1;
    }
  }

  return {
    studentId,
    lessonsVisitedCount: visitedDays.length,
    lessonsVisitedDays: visitedDays,
    lessonsCompletedCount: new Set([...completedFromEvents, ...computedComplete]).size,
    lessonsCompletedDays: [...new Set([...completedFromEvents, ...computedComplete])].sort((a, b) => a - b),
    quizAttempts,
    quizCorrect,
    quizCorrectRate: quizAttempts ? quizCorrect / quizAttempts : null,
    cardRatings,
    cardRatingCounts: ratingCounts,
    lastActivityAt: derived.lastActivityAt,
    lastActivityJst: derived.lastActivityAt ? formatJst(derived.lastActivityAt) : null,
    // Explicit disclaimer for teachers
    scoresArePracticeOnly: true,
  };
}

/**
 * Aggregate class roster summaries. Roster must be auth UIDs from membership table —
 * never fabricate placeholder students here.
 * @param {string[]} studentIds
 */
export function buildClassSummary(events, studentIds, daysCatalog = []) {
  if (!Array.isArray(studentIds)) throw new Error('studentIds array required');
  const students = studentIds.map((id) => buildStudentSummary(events, id, daysCatalog));
  const active = students.filter((s) => s.lastActivityAt);
  return {
    classSize: studentIds.length,
    studentsWithActivity: active.length,
    students,
    // No fake rows
    includesSyntheticStudents: false,
  };
}
