import { applyFurigana } from '../lib/furigana.js';

export function renderHome(root, { data, state, go }) {
  const doneQ = Object.values(state.questions).filter((q) => q.attempts > 0).length;
  const doneC = Object.values(state.cards).filter((c) => c.reps > 0).length;
  const daysTouched = Object.keys(state.daysTouched).length;
  root.innerHTML = `
    <section class="card">
      <h2>ビジネス・キャリア検定 3級<br/>生産管理オペレーション</h2>
      <p class="muted">Official 5 exam sets · 200 questions · Day01–30 path · Local progress only</p>
      <div class="progress-bar" aria-label="Question progress"><span style="width:${(doneQ/200)*100}%"></span></div>
      <p class="muted">${doneQ}/200 questions tried · ${doneC} cards practiced · ${daysTouched}/30 days touched</p>
      <div class="btn-row">
        <button class="btn" data-go="days">今日の学習 Start a day</button>
        <button class="btn secondary" data-go="flashcards">フラッシュカード</button>
        <button class="btn secondary" data-go="exams">過去問 200問</button>
        <button class="btn secondary" data-go="auth">ログイン</button>
      </div>
      <p class="muted">ゲスト学習は従来どおり端末内のみ。クラウド同期はプロジェクト接続後。</p>
    </section>
    <section class="card">
      <h3>Coverage (verified)</h3>
      <ul class="clean">
        <li>Questions: <strong>${data.manifest.checks.question_count}</strong> / 200 unique</li>
        <li>Answers + JP explanations: ${data.manifest.checks.with_jp_explanation}/200</li>
        <li>Days with 要点 sections: ${data.manifest.checks.days_with_yoten}/30</li>
        <li>Flashcards: ${data.manifest.checks.flashcard_count}</li>
        <li>Diagram/table crops: <strong>${data.manifest.checks.image_crops_available.length}</strong> available with page/bbox manifest</li>
      </ul>
      <p class="muted">Furigana from reviewed dictionary + compound overrides — not claimed flawless.</p>
    </section>
    <section class="card">
      <h3>Exam sets</h3>
      <div class="grid">
        ${data.sets.map((s) => `
          <button type="button" class="set-tile" data-exam="${s.id}">
            <div class="n">${applyFurigana(s.label_ja, data.furigana)}</div>
            <div class="muted">${s.label_en}</div>
            <div class="badge">${s.questions}問 · ${s.minutes}分</div>
          </button>`).join('')}
      </div>
    </section>`;
  root.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => go(b.dataset.go)));
  root.querySelectorAll('[data-exam]').forEach((b) => b.addEventListener('click', () => go('exams', { view: 'set', set: b.dataset.exam })));
}
