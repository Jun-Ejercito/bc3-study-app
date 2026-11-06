/**
 * Map 同趣旨クラスタ → curriculum days via each day's assigned question_ids.
 * Policy: lesson + review banks only. Mock days (full exam sets) are excluded
 * so clusters are not stamped onto Day28/29 merely by exam overlap.
 */

export function eligibleClusters(clusters) {
  return (clusters || []).filter((c) => c.kind === '言い換え' && (c.question_ids || []).length >= 2);
}

/** Days used for curriculum grouping (excludes mock). */
export function curriculumDays(days) {
  return (days || []).filter((d) => d.kind !== 'mock');
}

/**
 * Which curriculum days a cluster relates to (intersection with day.question_ids).
 * @returns {number[]} sorted day numbers
 */
export function daysForCluster(cluster, days) {
  const qset = new Set(cluster.question_ids || []);
  const out = [];
  for (const d of curriculumDays(days)) {
    const bank = d.question_ids || [];
    if (bank.some((id) => qset.has(id))) out.push(d.day);
  }
  return out;
}

export function resolveClusterDayFilter(params = {}) {
  const raw = params.day;
  if (raw === undefined || raw === null || raw === '' || raw === 'all') return 'all';
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1 || n > 30) return 'all';
  return n;
}

/**
 * Groups for UI. Each entry: { day, dayMeta, clusters: [{ cluster, relatedDays }] }
 * - filter 'all': one block per non-empty curriculum day (omit empty headings)
 * - filter N: single block for that day (may be empty → caller shows message)
 * Clusters spanning days appear under each related day; relatedDays lists all.
 * No duplicate cluster within the same day block.
 */
export function groupClustersByDay(clusters, days, filter = 'all') {
  const list = eligibleClusters(clusters);
  const curt = curriculumDays(days);
  const byDay = new Map(); // day -> Map(clusterId -> {cluster, relatedDays})

  for (const c of list) {
    const related = daysForCluster(c, days);
    for (const day of related) {
      if (!byDay.has(day)) byDay.set(day, new Map());
      const bucket = byDay.get(day);
      if (!bucket.has(c.id)) bucket.set(c.id, { cluster: c, relatedDays: related });
    }
  }

  const dayMeta = Object.fromEntries((days || []).map((d) => [d.day, d]));
  const targets =
    filter === 'all' ? curt.map((d) => d.day).filter((n) => byDay.has(n) && byDay.get(n).size) : [filter];

  return targets.map((day) => {
    const bucket = byDay.get(day) || new Map();
    const items = [...bucket.values()].sort(
      (a, b) => b.cluster.question_ids.length - a.cluster.question_ids.length || a.cluster.id.localeCompare(b.cluster.id),
    );
    return { day, dayMeta: dayMeta[day], clusters: items };
  });
}

export function formatRelatedDays(relatedDays, currentDay) {
  if (!relatedDays?.length) return '';
  const labels = relatedDays.map((n) => `Day${String(n).padStart(2, '0')}`);
  if (relatedDays.length === 1 && relatedDays[0] === currentDay) return '';
  return `関連 ${labels.join('・')}`;
}

export function clusterListQuery(dayFilter) {
  const q = { view: 'cluster' };
  if (dayFilter !== 'all') q.day = dayFilter;
  return q;
}
