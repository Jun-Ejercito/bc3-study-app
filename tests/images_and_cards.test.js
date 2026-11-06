import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const load = (n) => JSON.parse(readFileSync(join(root, 'public/data', n), 'utf8'));

test('all previously unavailable diagram questions now have crop files', () => {
  const man = load('image_manifest.json');
  const need = [
    'R5後-17','R5後-31','R5後-32','R6前-10','R6前-11','R6前-32',
    'R6後-9','R6後-26','R6後-40','R7前-10','R7前-16','R7前-30',
    'R7前-35','R7前-40','R7後-11','R7後-20','R7後-32','R7後-33',
  ];
  for (const id of need) {
    const item = man.items[id];
    assert.equal(item.status, 'ok', id);
    assert.equal(item.contains_answer, false, id);
    assert.ok(existsSync(join(root, 'public', item.file)), item.file);
    assert.ok(item.parts?.length >= 1, id + ' parts');
    assert.ok(item.parts[0].bbox_pts?.length === 4, id + ' bbox');
  }
});

test('questions.json image_status cropped for diagram set; zero unavailable', () => {
  const qs = load('questions.json');
  const unavail = qs.filter((q) => q.image_status === 'unavailable');
  assert.equal(unavail.length, 0);
  const cropped = qs.filter((q) => q.image_status === 'cropped');
  assert.ok(cropped.length >= 18);
});

test('言い換え clusters have 2+ real questions and named concepts', () => {
  const clusters = load('clusters.json');
  const ie = clusters.filter((c) => c.kind === '言い換え');
  assert.ok(ie.length >= 20);
  for (const c of ie) {
    assert.ok(c.question_ids.length >= 2, c.name);
    assert.ok(c.kind === '言い換え' && !c.name.startsWith('単独:'), c.name);
  }
});

test('review days have yoten from earlier days', () => {
  const days = load('days.json');
  for (const d of [7, 10, 22, 27, 30]) {
    const day = days.find((x) => x.day === d);
    assert.equal(day.kind, 'review');
    assert.ok(day.yoten.length > 0, 'Day' + d);
    assert.equal(day.yoten_coverage, 'review_of_earlier_days');
  }
});

test('flashcards have prompts and answers; sample multi-recall includes 4M', () => {
  const cards = load('flashcards.json');
  assert.ok(cards.length >= 400);
  const fourM = cards.find((c) => /4M/.test(c.prompt_ja) || /4M/.test(c.answer_ja));
  assert.ok(fourM, '4M card');
  assert.ok(fourM.answer_parts.length >= 4);
  for (const c of cards.slice(0, 50)) {
    assert.ok(c.prompt_ja && c.answer_ja, c.id);
    assert.ok(c.source, c.id);
  }
});
