import { applyFurigana, escapeHtml } from '../lib/furigana.js';
import { recordQuestion } from '../lib/storage.js';
import { assetUrl } from '../lib/assets.js';
import {
  resolveClusterDayFilter,
  groupClustersByDay,
  formatRelatedDays,
  clusterListQuery,
  curriculumDays,
  daysForCluster,
} from '../lib/clusterDays.js';

export function renderExams(root, { data, state, go, params, refreshChip }) {
  const view = params.view || 'set';
  root.innerHTML = `
    <h2>過去問</h2>
    <p class="muted">セット・日・章・同趣旨の4つの見方。解答履歴は共通。答えは確認するまで表示しません。</p>
    <div class="tabs" role="tablist">
      ${[['set','セット別'],['day','日別'],['chapter','章別'],['cluster','同趣旨クラスタ']].map(([v,l]) =>
        `<button type="button" data-view="${v}" aria-selected="${view===v}">${l}</button>`).join('')}
    </div>
    <div id="exam-panel"></div>`;
  root.querySelectorAll('[data-view]').forEach((b) => b.onclick = () => go('exams', { view: b.dataset.view }));
  const panel = root.querySelector('#exam-panel');
  if (view === 'set') renderBySet(panel, data, state, go, params, refreshChip);
  else if (view === 'day') renderByDay(panel, data, state, go, params, refreshChip);
  else if (view === 'chapter') renderByChapter(panel, data, state, go, params, refreshChip);
  else renderByCluster(panel, data, state, go, params, refreshChip);
}

function renderBySet(panel, data, state, go, params, refreshChip) {
  if (params.set && params.q) return renderQuestion(panel, data, state, params, refreshChip, () => go('exams', { view: 'set', set: params.set }));
  if (params.set) {
    const qs = data.questions.filter((q) => q.set === params.set);
    const meta = data.sets.find((s) => s.id === params.set);
    panel.innerHTML = `
      <button class="btn ghost" data-back>← セット一覧</button>
      <h3>${applyFurigana(meta.label_ja, data.furigana)}</h3>
      <p class="muted">${meta.minutes}分 · 合格目安 ${meta.pass_mark}／40問</p>
      <div class="grid">${qs.map((q) => qTile(q, state)).join('')}</div>`;
    panel.querySelector('[data-back]').onclick = () => go('exams', { view: 'set' });
    panel.querySelectorAll('[data-qid]').forEach((b) => b.onclick = () => go('exams', { view: 'set', set: params.set, q: b.dataset.qid }));
    return;
  }
  panel.innerHTML = `<div class="grid">${data.sets.map((s) => {
    const tried = data.questions.filter((q) => q.set === s.id && state.questions[q.id]?.attempts).length;
    return `<button type="button" class="set-tile" data-set="${s.id}">
      <div class="n">${applyFurigana(s.label_ja, data.furigana)}</div>
      <span class="badge">${tried}／40問 解答済み</span>
    </button>`;
  }).join('')}</div>`;
  panel.querySelectorAll('[data-set]').forEach((b) => b.onclick = () => go('exams', { view: 'set', set: b.dataset.set }));
}

function renderByDay(panel, data, state, go, params, refreshChip) {
  if (params.day && params.q) return renderQuestion(panel, data, state, params, refreshChip, () => go('exams', { view: 'day', day: params.day }));
  if (params.day) {
    const d = data.dayByN[+params.day];
    const qs = (d?.question_ids || []).map((id) => data.qById[id]).filter(Boolean);
    panel.innerHTML = `
      <button class="btn ghost" data-back>← 日別一覧</button>
      <h3>Day ${String(params.day).padStart(2,'0')}</h3>
      <div class="grid">${qs.map((q) => qTile(q, state)).join('') || '<p class="muted">この日に割り当てられた問題はありません</p>'}</div>`;
    panel.querySelector('[data-back]').onclick = () => go('exams', { view: 'day' });
    panel.querySelectorAll('[data-qid]').forEach((b) => b.onclick = () => go('exams', { view: 'day', day: params.day, q: b.dataset.qid }));
    return;
  }
  const kindJa = { lesson: '学習', review: '復習', mock: '模擬' };
  panel.innerHTML = `<div class="grid">${data.days.map((d) =>
    `<button type="button" class="day-tile" data-day="${d.day}">
      <div class="n">Day ${String(d.day).padStart(2,'0')}</div>
      <span class="badge ${d.kind}">${kindJa[d.kind] || d.kind}</span>
      <span class="muted">${d.question_ids.length}問</span>
    </button>`).join('')}</div>`;
  panel.querySelectorAll('[data-day]').forEach((b) => b.onclick = () => go('exams', { view: 'day', day: b.dataset.day }));
}

function renderByChapter(panel, data, state, go, params, refreshChip) {
  const chapters = {};
  for (const q of data.questions) {
    const key = `${q.category_ja || '未分類'}`;
    (chapters[key] ||= []).push(q);
  }
  if (params.chapter && params.q) return renderQuestion(panel, data, state, params, refreshChip, () => go('exams', { view: 'chapter', chapter: params.chapter }));
  if (params.chapter) {
    const qs = chapters[params.chapter] || [];
    panel.innerHTML = `
      <button class="btn ghost" data-back>← 章別一覧</button>
      <h3>${applyFurigana(params.chapter, data.furigana)}</h3>
      <div class="grid">${qs.map((q) => qTile(q, state)).join('')}</div>`;
    panel.querySelector('[data-back]').onclick = () => go('exams', { view: 'chapter' });
    panel.querySelectorAll('[data-qid]').forEach((b) => b.onclick = () => go('exams', { view: 'chapter', chapter: params.chapter, q: b.dataset.qid }));
    return;
  }
  panel.innerHTML = `<div class="grid">${Object.entries(chapters).map(([k, qs]) =>
    `<button type="button" class="set-tile" data-ch="${escapeHtml(k)}">
      <div class="n">${applyFurigana(k, data.furigana)}</div>
      <span class="badge">${qs.length}問</span>
    </button>`).join('')}</div>`;
  panel.querySelectorAll('[data-ch]').forEach((b) => b.onclick = () => go('exams', { view: 'chapter', chapter: b.dataset.ch }));
}

function renderByCluster(panel, data, state, go, params, refreshChip) {
  const dayFilter = resolveClusterDayFilter(params);
  const listQuery = () => clusterListQuery(dayFilter);

  if (params.cluster && params.q) {
    return renderQuestion(panel, data, state, params, refreshChip, () =>
      go('exams', { ...listQuery(), cluster: params.cluster }),
    );
  }
  if (params.cluster) {
    const c = data.clusters.find((x) => x.id === params.cluster);
    const qs = (c?.question_ids || []).map((id) => data.qById[id]).filter(Boolean);
    const relatedDays = c ? daysForCluster(c, data.days) : [];
    const relatedLabel = formatRelatedDays(relatedDays, dayFilter === 'all' ? null : dayFilter);
    panel.innerHTML = `
      <button class="btn ghost" data-back>← 同趣旨一覧</button>
      <h3>${applyFurigana(c?.name || '', data.furigana)}</h3>
      <p class="muted">同じ検証済み概念を問う本番の過去問のみです${relatedLabel ? ` · ${escapeHtml(relatedLabel)}` : ''}</p>
      <div class="grid">${qs.map((q) => qTile(q, state)).join('')}</div>`;
    panel.querySelector('[data-back]').onclick = () => go('exams', listQuery());
    panel.querySelectorAll('[data-qid]').forEach((b) =>
      b.onclick = () => go('exams', { ...listQuery(), cluster: params.cluster, q: b.dataset.qid }),
    );
    return;
  }

  const groups = groupClustersByDay(data.clusters, data.days, dayFilter);
  const dayOpts = curriculumDays(data.days);
  const selectHtml = `<label class="row" style="gap:.4rem;margin:.35rem 0 .55rem;">日程
    <select id="cluster-day" aria-label="クラスタの日程">
      <option value="all" ${dayFilter === 'all' ? 'selected' : ''}>全日程</option>
      ${dayOpts.map((d) => {
        const n = String(d.day).padStart(2, '0');
        const kind = d.kind === 'review' ? '復習' : '学習';
        const theme = (d.theme || '').slice(0, 22);
        return `<option value="${d.day}" ${dayFilter === d.day ? 'selected' : ''}>Day${n} ${kind}${theme ? ` · ${escapeHtml(theme)}` : ''}</option>`;
      }).join('')}
    </select>
  </label>`;

  let body;
  if (dayFilter !== 'all' && (!groups.length || !groups[0].clusters.length)) {
    body = `<div class="card"><p>この日に割り当てられた同趣旨クラスタはありません。</p></div>`;
  } else {
    body = groups.map(({ day, dayMeta, clusters }) => {
      const n = String(day).padStart(2, '0');
      const kind = dayMeta?.kind === 'review' ? '復習' : '学習';
      const theme = (dayMeta?.theme || '').slice(0, 36);
      const tiles = clusters.map(({ cluster: c, relatedDays }) => {
        const rel = formatRelatedDays(relatedDays, day);
        return `<button type="button" class="set-tile" data-cl="${escapeHtml(c.id)}">
          <div class="n">${applyFurigana(c.name, data.furigana)}</div>
          <span class="badge">言い換え ${c.question_ids.length}問</span>
          <div class="muted">${escapeHtml(c.category || '')}${rel ? ` · ${escapeHtml(rel)}` : ''}</div>
        </button>`;
      }).join('');
      return `<section class="cluster-day-block" data-day-block="${day}">
        <h3 class="cluster-day-heading">Day${n} · ${kind}${theme ? ` · ${escapeHtml(theme)}` : ''}</h3>
        <div class="grid">${tiles}</div>
      </section>`;
    }).join('');
  }

  panel.innerHTML = `<p class="muted">言い換えクラスタを学習日の割当に沿って表示（模擬日の試験セット全体への機械割当なし）。</p>
    ${selectHtml}
    ${body}`;
  panel.querySelector('#cluster-day').onchange = (e) => {
    const v = e.target.value;
    go('exams', v === 'all' ? { view: 'cluster' } : { view: 'cluster', day: Number(v) }, { replace: true });
  };
  panel.querySelectorAll('[data-cl]').forEach((b) =>
    b.onclick = () => go('exams', { ...listQuery(), cluster: b.dataset.cl }),
  );
}


function qTile(q, state) {
  const st = state.questions[q.id];
  const mark = st ? (st.lastCorrect ? '★' : '・') : '';
  return `<button type="button" class="day-tile" data-qid="${q.id}">
    <div class="n">${q.id} <span class="star">${mark}</span></div>
    <div class="muted">${escapeHtml((q.topic || '').slice(0, 28))}</div>
    ${st ? `<span class="badge">${st.correct}／${st.attempts}回</span>` : '<span class="badge">未解答</span>'}
  </button>`;
}

function renderQuestion(panel, data, state, params, refreshChip, back) {
  const q = data.qById[params.q];
  if (!q) { panel.innerHTML = '<p>Question not found</p>'; return; }
  panel.innerHTML = `
    <button class="btn ghost" data-back>← Back</button>
    <article class="card spacious">
      <div class="row"><span class="badge">${q.id}</span>
        <span class="badge">${applyFurigana(q.category_ja || '', data.furigana)}</span>
        <span class="muted">${escapeHtml(q.topic || '')}</span>
      </div>
      <p>${applyFurigana(q.stem, data.furigana)}</p>
      ${q.image ? `<img class="q-image" src="${assetUrl(q.image)}" alt="Question page image (answer key not included)" data-zoom />` : ''}
      ${q.image_status === 'unavailable' ? `<p class="muted">Image crop unavailable — text only. ${escapeHtml(q.image_note || '')}</p>` : ''}
      <div>${Object.entries(q.choices).map(([k, v]) =>
        `<button type="button" class="choice" data-c="${k}"><strong>${k}</strong> ${applyFurigana(v, data.furigana)}</button>`).join('')}</div>
      <button class="btn" data-check disabled>答え合わせ</button>
      <div class="reveal-box" hidden data-rev></div>
      <p class="muted">Shared id across all 4 views · history saved locally</p>
    </article>`;
  panel.querySelector('[data-back]').onclick = back;
  let selected = null;
  panel.querySelectorAll('.choice').forEach((b) => b.onclick = () => {
    selected = b.dataset.c;
    panel.querySelectorAll('.choice').forEach((x) => x.classList.toggle('selected', x === b));
    panel.querySelector('[data-check]').disabled = false;
  });
  panel.querySelector('[data-check]').onclick = () => {
    recordQuestion(state, q.id, selected, q.answer, q.day);
    refreshChip?.();
    const ok = selected === q.answer;
    const box = panel.querySelector('[data-rev]');
    box.hidden = false;
    box.innerHTML = `<p><strong>${ok ? '正解' : '不正解'}</strong> · 正解 <strong>${q.answer}</strong></p>
      <p>${applyFurigana(q.explanation_jp || q.explanation_en, data.furigana)}</p>
      <p class="muted">${escapeHtml(q.ref?.text || '')}</p>`;
    panel.querySelectorAll('.choice').forEach((b) => {
      b.disabled = true;
      if (b.dataset.c === q.answer) b.classList.add('correct');
      else if (b.dataset.c === selected && !ok) b.classList.add('wrong');
    });
  };
  panel.querySelector('[data-zoom]')?.addEventListener('click', (e) => {
    const lb = document.createElement('div');
    lb.className = 'lightbox';
    lb.innerHTML = `<img src="${e.currentTarget.src}" alt="Zoom" />`;
    lb.onclick = () => lb.remove();
    document.body.appendChild(lb);
  });
}
