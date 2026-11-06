export function renderProgress(root, { data, state }) {
  const qTried = Object.entries(state.questions);
  const correct = qTried.reduce((n, [, v]) => n + (v.correct || 0), 0);
  const attempts = qTried.reduce((n, [, v]) => n + (v.attempts || 0), 0);
  const bySet = data.sets.map((s) => {
    const qs = data.questions.filter((q) => q.set === s.id);
    const tried = qs.filter((q) => state.questions[q.id]?.attempts).length;
    const ok = qs.filter((q) => state.questions[q.id]?.lastCorrect).length;
    return { s, tried, ok, total: qs.length };
  });
  const mastered = Object.values(state.cards).filter((c) => c.status === 'mastered').length;
  root.innerHTML = `
    <h2>進捗 Progress</h2>
    <div class="card">
      <p>Questions tried: <strong>${qTried.length}/200</strong></p>
      <p>Answer attempts: ${attempts} · Correct marks: ${correct}</p>
      <p>Cards practiced: ${Object.keys(state.cards).length} · Mastered: ${mastered}</p>
      <p>Days touched: ${Object.keys(state.daysTouched).length}/30</p>
    </div>
    <div class="card">
      <h3>By exam set</h3>
      ${bySet.map(({ s, tried, ok, total }) => `
        <div style="margin:.5rem 0">
          <div class="row"><strong>${s.label_ja}</strong> <span class="muted">${tried}/${total} tried · last-correct ${ok}</span></div>
          <div class="progress-bar"><span style="width:${(tried/total)*100}%"></span></div>
        </div>`).join('')}
    </div>
    <p class="muted">Progress uses the active scope (guest or signed-in account key). Signed-in devices sync append-only events when Supabase is connected. Use Settings → Export to back up.</p>`;
}
