import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const load = (n) => JSON.parse(readFileSync(join(root, 'public/data', n), 'utf8'));

test('200 unique questions, 40 per set', () => {
  const qs = load('questions.json');
  assert.equal(qs.length, 200);
  assert.equal(new Set(qs.map((q) => q.id)).size, 200);
  const sets = {};
  for (const q of qs) sets[q.set] = (sets[q.set] || 0) + 1;
  assert.deepEqual(sets, { 'R5後': 40, 'R6前': 40, 'R6後': 40, 'R7前': 40, 'R7後': 40 });
});

test('every question has answer and day mapping', () => {
  const qs = load('questions.json');
  for (const q of qs) {
    assert.ok(['ア', 'イ', 'ウ', 'エ'].includes(q.answer), q.id);
    assert.ok(q.day >= 1 && q.day <= 30, q.id + ' day');
    assert.ok(q.explanation_jp || q.explanation_en, q.id + ' expl');
  }
});

test('R6前 32-34 answers match official key', () => {
  const qs = load('questions.json');
  const want = { 'R6前-32': 'ア', 'R6前-33': 'エ', 'R6前-34': 'エ' };
  for (const [id, a] of Object.entries(want)) {
    assert.equal(qs.find((q) => q.id === id).answer, a);
  }
});

test('set labels are real era/term names', () => {
  const sets = load('sets.json');
  assert.deepEqual(sets.map((s) => s.id), ['R5後', 'R6前', 'R6後', 'R7前', 'R7後']);
  assert.ok(sets.every((s) => /令和[567]年度/.test(s.label_ja)));
});

test('days 1-30 present; mock days 28/29 point at R7前/R7後', () => {
  const days = load('days.json');
  assert.equal(days.length, 30);
  assert.equal(days.find((d) => d.day === 28).mock_set, 'R7前');
  assert.equal(days.find((d) => d.day === 29).mock_set, 'R7後');
});

test('clusters only contain real question ids', () => {
  const qs = new Set(load('questions.json').map((q) => q.id));
  const clusters = load('clusters.json');
  for (const c of clusters) {
    for (const id of c.question_ids) assert.ok(qs.has(id), id);
  }
});

test('manifest checks agree', () => {
  const man = load('manifest.json');
  assert.equal(man.checks.question_count, 200);
  assert.equal(man.checks.answers_present, true);
  assert.ok(Array.isArray(man.limitations));
});

test('no fabricated authored exam questions', () => {
  const qs = load('questions.json');
  assert.ok(qs.every((q) => q.authored === false));
});
