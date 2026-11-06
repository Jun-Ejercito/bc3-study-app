import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  eligibleClusters,
  daysForCluster,
  groupClustersByDay,
  resolveClusterDayFilter,
  clusterListQuery,
  curriculumDays,
  formatRelatedDays,
} from '../src/lib/clusterDays.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const load = (n) => JSON.parse(readFileSync(join(root, 'public/data', n), 'utf8'));

describe('cluster day grouping', () => {
  const clusters = load('clusters.json');
  const days = load('days.json');
  const eligible = eligibleClusters(clusters);

  it('all 言い換え clusters are reachable under some curriculum day', () => {
    assert.ok(eligible.length >= 20);
    const seen = new Set();
    for (const g of groupClustersByDay(clusters, days, 'all')) {
      for (const { cluster } of g.clusters) seen.add(cluster.id);
    }
    for (const c of eligible) {
      assert.ok(seen.has(c.id), `unreachable ${c.id}`);
    }
  });

  it('day filter returns only that day’s clusters; question ids unchanged', () => {
    const g1 = groupClustersByDay(clusters, days, 1);
    assert.equal(g1.length, 1);
    assert.equal(g1[0].day, 1);
    const bank = new Set(days.find((d) => d.day === 1).question_ids);
    for (const { cluster, relatedDays } of g1[0].clusters) {
      assert.ok(relatedDays.includes(1));
      assert.ok(cluster.question_ids.some((id) => bank.has(id)));
      // full cluster retained in data object
      const raw = clusters.find((x) => x.id === cluster.id);
      assert.deepEqual(cluster.question_ids, raw.question_ids);
    }
  });

  it('cross-day clusters list multiple relatedDays and keep full question set', () => {
    const multi = eligible.find((c) => daysForCluster(c, days).length >= 2);
    assert.ok(multi, 'need a multi-day cluster');
    const related = daysForCluster(multi, days);
    assert.ok(related.length >= 2);
    for (const day of related) {
      const g = groupClustersByDay(clusters, days, day);
      const hit = g[0].clusters.find((x) => x.cluster.id === multi.id);
      assert.ok(hit, `missing under day ${day}`);
      assert.deepEqual(hit.relatedDays, related);
      assert.deepEqual(hit.cluster.question_ids, multi.question_ids);
    }
    assert.match(formatRelatedDays(related, related[0]), /関連 Day/);
  });

  it('no duplicate cluster cards within the same day block', () => {
    for (const g of groupClustersByDay(clusters, days, 'all')) {
      const ids = g.clusters.map((x) => x.cluster.id);
      assert.equal(ids.length, new Set(ids).size, `dup day ${g.day}`);
    }
  });

  it('mock days are not used for curriculum grouping', () => {
    const curt = curriculumDays(days);
    assert.ok(curt.every((d) => d.kind !== 'mock'));
    const mockDays = days.filter((d) => d.kind === 'mock').map((d) => d.day);
    assert.ok(mockDays.length >= 1);
    for (const g of groupClustersByDay(clusters, days, 'all')) {
      assert.equal(mockDays.includes(g.day), false);
    }
    // filtering to a mock day yields empty (no fabricated groups with content from mock expansion)
    for (const md of mockDays) {
      const g = groupClustersByDay(clusters, days, md);
      // curriculumDays excludes mock so byDay never gets mock keys → empty clusters
      assert.ok(!g.length || g[0].clusters.length === 0);
    }
  });

  it('all-days mode omits empty headings', () => {
    const groups = groupClustersByDay(clusters, days, 'all');
    assert.ok(groups.every((g) => g.clusters.length > 0));
  });

  it('query helpers preserve day filter for back links; bare cluster links ok', () => {
    assert.deepEqual(resolveClusterDayFilter({}), 'all');
    assert.deepEqual(resolveClusterDayFilter({ day: 'all' }), 'all');
    assert.deepEqual(resolveClusterDayFilter({ day: 5 }), 5);
    assert.deepEqual(clusterListQuery('all'), { view: 'cluster' });
    assert.deepEqual(clusterListQuery(3), { view: 'cluster', day: 3 });
  });

  it('exams view wires day select and full cluster question set', () => {
    const src = readFileSync(join(root, 'src/views/exams.js'), 'utf8');
    assert.match(src, /groupClustersByDay/);
    assert.match(src, /cluster-day/);
    assert.match(src, /全日程/);
    assert.match(src, /listQuery\(\)/);
    assert.match(src, /question_ids \|\| \[\]\)\.map/);
  });
});
