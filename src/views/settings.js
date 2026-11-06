import { exportJson, importJson, resetAll, saveState } from '../lib/storage.js';

export function renderSettings(root, { data, state, setState }) {
  root.innerHTML = `
    <h2>設定・バックアップ</h2>
    <div class="card">
      <h3>Local storage only</h3>
      <p>v1 does <strong>not</strong> sync to the cloud. Progress stays in this browser.</p>
      <p class="muted">Backup: Export JSON and save the file somewhere safe (Drive, USB). Restore: paste or load that JSON.</p>
      <div class="btn-row">
        <button class="btn" id="export">Export JSON</button>
        <button class="btn secondary" id="copy">Copy to clipboard</button>
      </div>
      <textarea class="export" id="out" readonly></textarea>
    </div>
    <div class="card">
      <h3>Import</h3>
      <textarea class="export" id="inp" placeholder="Paste backup JSON here"></textarea>
      <div class="btn-row">
        <button class="btn" id="import">Import &amp; replace</button>
        <label class="btn secondary">Load file<input type="file" id="file" accept="application/json,.json" hidden /></label>
      </div>
      <p id="msg" class="muted"></p>
    </div>
    <div class="card">
      <h3>Reset</h3>
      <button class="btn none" id="reset" style="background:#fff;color:var(--red);border-color:var(--red)">Clear all local progress</button>
    </div>
    <div class="card">
      <h3>Provenance</h3>
      <p class="muted">Built ${data.manifest.built_at}</p>
      <ul class="clean">${(data.manifest.limitations||[]).map((l)=>`<li>${l}</li>`).join('')}</ul>
    </div>`;
  const out = root.querySelector('#out');
  root.querySelector('#export').onclick = () => { out.value = exportJson(state); };
  root.querySelector('#copy').onclick = async () => {
    out.value = exportJson(state);
    await navigator.clipboard.writeText(out.value);
    root.querySelector('#msg').textContent = 'Copied.';
  };
  root.querySelector('#import').onclick = () => {
    try {
      const next = importJson(root.querySelector('#inp').value);
      setState(next);
      root.querySelector('#msg').textContent = 'Imported.';
    } catch (e) {
      root.querySelector('#msg').textContent = String(e.message || e);
    }
  };
  root.querySelector('#file').onchange = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const text = await f.text();
    root.querySelector('#inp').value = text;
  };
  root.querySelector('#reset').onclick = () => {
    if (!confirm('Clear all local progress?')) return;
    const next = resetAll();
    setState(next);
    root.querySelector('#msg').textContent = 'Cleared.';
  };
}
