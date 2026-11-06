import { applyFurigana, escapeHtml } from '../lib/furigana.js';
import { answerRevealMarkup, rateButtonsMarkup, bindAnswerReveal } from '../lib/flashReveal.js';
import { recordQuestion, recordCard, touchDay, saveState } from '../lib/storage.js';
import { buildRound } from '../lib/scheduler.js';
import { assetUrl } from '../lib/assets.js';

export function renderDaysList(root, { data, state, go }) {
  root.innerHTML = `
    <h2>日別学習 Days</h2>
    <p class="muted">Same order as lesson files Day01–Day30. Review / mock days marked.</p>
    <div class="grid">
      ${data.days.map((d) => {
        const tried = d.question_ids.filter((id) => state.questions[id]?.attempts).length;
        const badge = d.kind === 'review' ? 'review' : d.kind === 'mock' ? 'mock' : '';
        return `<button type="button" class="day-tile" data-day="${d.day}">
          <div class="n">Day ${String(d.day).padStart(2,'0')}</div>
          <div class="muted">${escapeHtml((d.theme || d.banner || '').slice(0, 42))}</div>
          <span class="badge ${badge}">${d.kind}</span>
          <span class="muted"> Q ${tried}/${d.question_ids.length || (d.kind==='mock'?40:0)}</span>
        </button>`;
      }).join('')}
    </div>`;
  root.querySelectorAll('[data-day]').forEach((b) => b.addEventListener('click', () => go('day', { day: +b.dataset.day })));
}

export function renderDay(root, { data, state, go, params, refreshChip }) {
  const d = data.dayByN[params.day];
  if (!d) { root.innerHTML = '<p>Day not found</p>'; return; }
  touchDay(state, d.day); saveState(state);
  const tab = params.tab || 'yoten';
  root.innerHTML = `
    <button class="btn ghost" data-back>← Days</button>
    <h2>Day ${String(d.day).padStart(2,'0')} · ${applyFurigana(d.theme || d.kind, data.furigana)}</h2>
    <p class="muted">${applyFurigana(d.banner || '', data.furigana)}</p>
    <div class="tabs" role="tablist">
      ${['yoten','mini','recall','cards'].map((t) =>
        `<button type="button" role="tab" data-tab="${t}" aria-selected="${tab===t}">${
          { yoten:'要点', mini:'ミニテスト', recall:'思い出し', cards:'カード' }[t]
        }</button>`).join('')}
    </div>
    <div id="day-panel"></div>`;
  root.querySelector('[data-back]').onclick = () => go('days');
  root.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => go('day', { day: d.day, tab: b.dataset.tab }));
  const panel = root.querySelector('#day-panel');
  if (tab === 'yoten') renderYoten(panel, d, data);
  else if (tab === 'mini') renderMini(panel, d, data, state, refreshChip);
  else if (tab === 'recall') renderRecall(panel, d, data, state, refreshChip);
  else renderDayCards(panel, d, data, state, refreshChip);
}

function renderYoten(panel, d, data) {
  if (!d.yoten?.length) {
    panel.innerHTML = `<div class="card"><p>この日用の要点カードはまだありません。ミニテストや思い出しワークで復習してください。</p></div>`;
    return;
  }
  let head = '';
  if (d.kind === 'review') {
    head = `<div class="card"><p><strong>復習日の要点</strong> — Day ${(d.review_source_days||[]).join(', ')} で学んだ要点の再確認です。</p>
      <p class="muted">${escapeHtml(d.banner_extra || '')}</p></div>`;
  } else if (d.kind === 'mock') {
    head = `<div class="card"><p><strong>模擬試験前の要点まとめ</strong> — これまでに学んだ要点の要約です（${(d.review_source_days||[]).length}日分）。</p>
      <p class="muted">${escapeHtml(d.banner_extra || '')}</p></div>`;
  }
  panel.innerHTML = head + d.yoten.map((s) => `
    <article class="card">
      <h3>${applyFurigana(s.title || s.id, data.furigana)}
        ${s.from_day ? `<span class="badge review">Day ${s.from_day}</span>` : `<span class="badge">${s.id}</span>`}</h3>
      <ul class="clean">${(s.bullets||[]).slice(0,12).map((b)=>`<li>${applyFurigana(b, data.furigana)}</li>`).join('')}</ul>
      ${(s.warnings||[]).map((w)=>`<div class="warn">⚠ ${applyFurigana(w, data.furigana)}</div>`).join('')}
    </article>`).join('');
}

function renderMini(panel, d, data, state, refreshChip) {
  const qs = d.question_ids.map((id) => data.qById[id]).filter(Boolean);
  if (!qs.length) {
    panel.innerHTML = `<div class="card"><p>この日の割り当て過去問はありません。
      ${d.kind==='mock' ? '模擬試験は「過去問」のセット別ビュー（R7前/R7後）を使ってください。' : ''}</p></div>`;
    return;
  }
  let idx = 0;
  const draw = () => {
    const q = qs[idx];
    const st = state.questions[q.id];
    panel.innerHTML = `
      <div class="card spacious" data-qid="${q.id}">
        <div class="row"><span class="badge">${q.id}</span>
          <span class="muted">${idx+1}/${qs.length}</span>
          ${st ? `<span class="muted">tried ${st.attempts} · correct ${st.correct}</span>` : ''}
        </div>
        <p>${applyFurigana(q.stem, data.furigana)}</p>
        ${q.image ? `<img class="q-image" src="${assetUrl(q.image)}" alt="Question figure (no answer)" data-zoom />` : ''}
        ${q.image_status==='unavailable' ? `<p class="muted">Figure crop unavailable in v1 — text stem/choices shown. ${escapeHtml(q.image_note||'')}</p>` : ''}
        <div class="choices">
          ${Object.entries(q.choices).map(([k,v]) =>
            `<button type="button" class="choice" data-choice="${k}"><strong>${k}</strong> ${applyFurigana(v, data.furigana)}</button>`
          ).join('')}
        </div>
        <div class="btn-row">
          <button class="btn" data-check disabled>答え合わせ Check</button>
          <button class="btn secondary" data-prev ${idx===0?'disabled':''}>前へ</button>
          <button class="btn secondary" data-next ${idx>=qs.length-1?'disabled':''}>次へ</button>
        </div>
        <div class="reveal-box" hidden data-reveal></div>
      </div>`;
    let selected = null;
    panel.querySelectorAll('.choice').forEach((b) => b.onclick = () => {
      selected = b.dataset.choice;
      panel.querySelectorAll('.choice').forEach((x) => x.classList.toggle('selected', x === b));
      panel.querySelector('[data-check]').disabled = false;
    });
    panel.querySelector('[data-check]').onclick = () => {
      if (!selected) return;
      recordQuestion(state, q.id, selected, q.answer, d.day);
      refreshChip?.();
      const box = panel.querySelector('[data-reveal]');
      const ok = selected === q.answer;
      box.hidden = false;
      box.innerHTML = `
        <p><strong>${ok ? '正解' : '不正解'}</strong> · 正解は <strong>${q.answer}</strong></p>
        <p>${applyFurigana(q.explanation_jp || q.explanation_en || '', data.furigana)}</p>
        <p class="muted">${escapeHtml(q.ref?.text || '')}</p>`;
      panel.querySelectorAll('.choice').forEach((b) => {
        b.disabled = true;
        if (b.dataset.choice === q.answer) b.classList.add('correct');
        else if (b.dataset.choice === selected && !ok) b.classList.add('wrong');
      });
    };
    panel.querySelector('[data-prev]').onclick = () => { idx--; draw(); };
    panel.querySelector('[data-next]').onclick = () => { idx++; draw(); };
    panel.querySelector('[data-zoom]')?.addEventListener('click', (e) => {
      const src = e.currentTarget.src;
      const lb = document.createElement('div');
      lb.className = 'lightbox'; lb.tabIndex = 0; lb.role = 'dialog'; lb.ariaLabel = 'Zoomed question image (answers not included)';
      lb.innerHTML = `<img src="${src}" alt="Zoomed question" />`;
      lb.onclick = () => lb.remove();
      document.body.appendChild(lb); lb.focus();
    });
  };
  draw();
}

function renderRecall(panel, d, data, state, refreshChip) {
  const r = d.recall;
  if (!r) { panel.innerHTML = '<div class="card"><p>思い出しワークなし</p></div>'; return; }
  const blocks = [];
  if (r.web) {
    const [center, br] = r.web;
    blocks.push(`<div class="card"><h3>ことばマップ：${applyFurigana(center, data.furigana)}</h3>
      <ol>${br.map(([a,h],i)=>`<li><button class="btn secondary" data-reveal-ans="${i}">ヒント：${escapeHtml(h)}</button>
        <span hidden data-ans="${i}">${applyFurigana(a, data.furigana)}</span></li>`).join('')}</ol></div>`);
  }
  (r.recall||[]).forEach((pair, i) => {
    blocks.push(`<div class="card"><p>${applyFurigana(pair[0], data.furigana)}</p>
      <button class="btn secondary" data-r="${i}">答えを見る</button>
      <div class="reveal-box" hidden data-rv="${i}">${applyFurigana(pair[1], data.furigana)}</div></div>`);
  });
  (r.cloze||[]).forEach((s, i) => {
    const shown = s.replace(/\{([^}]+)\}/g, '（　）');
    const ans = [...s.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]).join('・');
    blocks.push(`<div class="card"><p>${applyFurigana(shown, data.furigana)}</p>
      <button class="btn secondary" data-c="${i}">答えを見る</button>
      <div class="reveal-box" hidden data-cv="${i}">${applyFurigana(ans, data.furigana)}</div></div>`);
  });
  (r.ox||[]).forEach((row, i) => {
    const [stmt, ox, expl] = row;
    blocks.push(`<div class="card"><p>${applyFurigana(stmt, data.furigana)}</p>
      <div class="btn-row">
        <button class="btn secondary" data-ox="○:${i}">○</button>
        <button class="btn secondary" data-ox="×:${i}">×</button>
      </div>
      <div class="reveal-box" hidden data-oxv="${i}"></div></div>`);
  });
  panel.innerHTML = blocks.join('') || '<div class="card"><p>なし</p></div>';
  panel.querySelectorAll('[data-reveal-ans]').forEach((b) => b.onclick = () => {
    panel.querySelector(`[data-ans="${b.dataset.revealAns}"]`).hidden = false;
  });
  panel.querySelectorAll('[data-r]').forEach((b) => b.onclick = () => { panel.querySelector(`[data-rv="${b.dataset.r}"]`).hidden = false; });
  panel.querySelectorAll('[data-c]').forEach((b) => b.onclick = () => { panel.querySelector(`[data-cv="${b.dataset.c}"]`).hidden = false; });
  panel.querySelectorAll('[data-ox]').forEach((b) => b.onclick = () => {
    const [choice, i] = b.dataset.ox.split(':');
    const [stmt, ox, expl] = r.ox[+i];
    const box = panel.querySelector(`[data-oxv="${i}"]`);
    box.hidden = false;
    const ok = choice === ox;
    box.innerHTML = `<p>${ok ? '正解' : `<span class="wrong-text">不正解</span>`} · 正解は <strong>${ox}</strong></p>
      <p>${applyFurigana(expl, data.furigana)}</p>`;
  });
}

function renderDayCards(panel, d, data, state, refreshChip) {
  const cards = d.card_ids.map((id) => data.cardById[id]).filter(Boolean);
  const round = buildRound(cards, state.cards, { limit: 15 });
  if (!round.length) { panel.innerHTML = '<div class="card"><p>カードがありません</p></div>'; return; }
  let i = 0; let revealed = false;
  const draw = () => {
    const c = round[i];
    revealed = false;
    panel.innerHTML = `
      <div class="card spacious flash-front">
        <div class="row"><span class="badge">${c.type}</span><span class="muted">${i+1}/${round.length}</span></div>
        <p>${applyFurigana(c.prompt_ja, data.furigana)}</p>
        ${answerRevealMarkup()}
        <div class="reveal-box" hidden data-back>
          <p><strong>${applyFurigana(c.answer_ja, data.furigana)}</strong></p>
          ${c.explanation_ja ? `<p class="muted">${applyFurigana(c.explanation_ja, data.furigana)}</p>` : ''}
          ${rateButtonsMarkup()}
        </div>
      </div>`;
    const gate = bindAnswerReveal(panel, { onReveal: () => { revealed = true; } });
    panel.querySelectorAll('[data-rate]').forEach((b) => b.onclick = (ev) => {
      ev.stopPropagation();
      if (!revealed || !gate.revealed()) return;
      recordCard(state, c.id, b.dataset.rate, d.day);
      refreshChip?.();
      i++;
      if (i >= round.length) panel.innerHTML = '<div class="card"><p>ラウンド終了。進捗は端末内に保存されました。</p></div>';
      else draw();
    });
  };
  draw();
}
