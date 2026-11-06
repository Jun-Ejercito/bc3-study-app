import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const load = (n) => JSON.parse(readFileSync(join(root, 'public/data', n), 'utf8'));

const DEBRIS = /jc2|Font:游|hps\d+|EQ\s*\\|instrText|\\\*\\s*"Font|\\\\o\\\\ad/;

test('R7後-26 explanation is clean readable Japanese (regression)', () => {
  const q = load('questions.json').find((x) => x.id === 'R7後-26');
  assert.ok(q);
  assert.equal(q.answer, 'ア');
  assert.match(q.explanation_jp, /不適切/);
  assert.match(q.explanation_jp, /品質管理/);
  assert.match(q.explanation_jp, /買手の要求に合った/);
  assert.doesNotMatch(q.explanation_jp, DEBRIS);
  assert.doesNotMatch(q.explanation_jp, /9\(ひんしつ\)/);
  assert.doesNotMatch(q.explanation_jp, /游明朝/);
});

test('no Word field debris in any of 200 JP explanations', () => {
  const qs = load('questions.json');
  const bad = qs.filter((q) => DEBRIS.test(q.explanation_jp || ''));
  assert.deepEqual(bad.map((q) => q.id), []);
});

test('no debris in flashcards or 要点 sections', () => {
  const cards = load('flashcards.json');
  const yoten = load('yoten_sections.json');
  for (const c of cards) {
    const blob = `${c.prompt_ja||''}${c.answer_ja||''}${c.explanation_ja||''}`;
    assert.doesNotMatch(blob, DEBRIS, c.id);
  }
  for (const [id, s] of Object.entries(yoten)) {
    const blob = `${s.title||''}${(s.bullets||[]).join('')}${(s.warnings||[]).join('')}`;
    assert.doesNotMatch(blob, DEBRIS, id);
  }
});

test('review and mock days expose non-empty 要点 without workspace paths', () => {
  const days = load('days.json');
  for (const n of [7, 10, 22, 27, 28, 29, 30]) {
    const d = days.find((x) => x.day === n);
    assert.ok(d.yoten.length > 0, 'Day' + n);
    assert.ok(!('lesson_docx' in d), 'Day' + n + ' path');
    const blob = JSON.stringify(d);
    assert.doesNotMatch(blob, /\/workspace/);
  }
});

test('nav CSS forces [hidden] to display:none', () => {
  const css = readFileSync(join(root, 'src/styles/app.css'), 'utf8');
  assert.match(css, /\.nav\[hidden\]\s*\{\s*display:\s*none\s*!important/);
  assert.match(css, /\[hidden\]\s*\{\s*display:\s*none\s*!important/);
});
