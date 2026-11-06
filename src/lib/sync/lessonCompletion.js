/**
 * Lesson completion ≠ visited.
 *
 * Existing app: touchDay() on opening a day page = visited only.
 * Completion requires objective + self-rated activity against that day's bank.
 *
 * Default rule (data-driven from day.question_ids / day.card_ids):
 *   - If the day has assigned questions: every question_id has ≥1 quiz attempt
 *     in the student's progress map (objective).
 *   - AND if the day has assigned cards: ≥1 self-rating exists for each card_id
 *     OR (when card_ids empty) skip card requirement.
 *   - Mock days (kind==='mock'): completion uses question bank only (40 Q),
 *     cards optional because mock focus is exam practice.
 *
 * Teachers may later tighten via class policy; this module is the default.
 */

/**
 * @param {object} day  { day, kind, question_ids, card_ids }
 * @param {object} progress  { questions: { [qid]: { attempts } }, cards: { [cid]: { reps|history } } }
 */
export function evaluateLessonCompletion(day, progress = {}) {
  if (!day || day.day == null) {
    return { complete: false, visitedOnlyPossible: true, reasons: ['missing_day'] };
  }
  const qids = day.question_ids || [];
  const cids = day.card_ids || [];
  const questions = progress.questions || {};
  const cards = progress.cards || {};

  const qDone = qids.filter((id) => (questions[id]?.attempts || 0) >= 1);
  const cDone = cids.filter((id) => {
    const c = cards[id];
    return c && ((c.reps || 0) >= 1 || (c.history || []).length >= 1);
  });

  const reasons = [];
  let complete = true;

  if (qids.length) {
    if (qDone.length < qids.length) {
      complete = false;
      reasons.push(`questions_${qDone.length}/${qids.length}`);
    }
  } else if (day.kind === 'lesson') {
    // Lesson with no question bank: require cards if any
    if (!cids.length) {
      complete = false;
      reasons.push('no_bank');
    }
  }

  if (cids.length && day.kind !== 'mock') {
    if (cDone.length < cids.length) {
      complete = false;
      reasons.push(`cards_${cDone.length}/${cids.length}`);
    }
  }

  return {
    complete,
    day: day.day,
    kind: day.kind,
    questionsDone: qDone.length,
    questionsTotal: qids.length,
    cardsDone: cDone.length,
    cardsTotal: cids.length,
    reasons,
  };
}

/** Whether daysTouched-style visit should emit lesson_visited only. */
export function isVisitNotCompletion() {
  return true;
}
