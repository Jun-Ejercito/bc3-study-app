import { createSupabaseSyncAdapter } from '../lib/supabase/adapter.js';
import { readSupabaseConfig } from '../lib/supabase/config.js';
import { buildClassSummary } from '../lib/sync/summaries.js';
import { formatJst } from '../lib/sync/time.js';

/**
 * Teacher dashboard — data only via RLS-backed queries.
 * No synthetic student rows. No client self-grant of teacher role.
 * create_class / add_class_student usable only after owner grant_teacher.
 */
export function renderTeacher(root, { data, go }) {
  const cfg = readSupabaseConfig();
  const adapter = createSupabaseSyncAdapter();

  const run = async () => {
    if (!cfg.configured) {
      root.innerHTML = `
        <h2>教師ダッシュボード</h2>
        <div class="warn"><strong>未接続</strong> — Supabase 未設定のためクラスデータはありません。デモ生徒は表示しません。</div>
        <button type="button" class="btn ghost" data-home>ホームへ</button>`;
      root.querySelector('[data-home]').onclick = () => go('home');
      return;
    }

    root.innerHTML = `<h2>教師ダッシュボード</h2><p class="muted">読み込み中…</p>`;
    let session;
    try {
      session = await adapter.getSession();
    } catch (e) {
      root.innerHTML = `<h2>教師ダッシュボード</h2><p class="wrong-text">${escapeHtml(e.message)}</p>`;
      return;
    }
    if (!session) {
      root.innerHTML = `
        <h2>教師ダッシュボード</h2>
        <p>ログインが必要です。教師権限はサーバー側の登録が必要で、フォームから自己申告できません。</p>
        <button type="button" class="btn" data-auth>ログインへ</button>`;
      root.querySelector('[data-auth]').onclick = () => go('auth');
      return;
    }

    let memberships = [];
    let membershipError = null;
    try {
      memberships = await adapter.listMyClasses();
    } catch (e) {
      membershipError = e;
    }

    const teacherClasses = (memberships || []).filter((m) => m.role === 'teacher');

    if (membershipError) {
      root.innerHTML = `
        <h2>教師ダッシュボード</h2>
        <p class="wrong-text">クラス取得に失敗（権限なしの可能性）: ${escapeHtml(membershipError.message)}</p>
        <p class="muted">教師は private.grant_teacher(uid) でサーバー側登録後、create_class を使います。クライアントからロール昇格はできません。</p>
        <button type="button" class="btn ghost" data-home>ホームへ</button>`;
      root.querySelector('[data-home]').onclick = () => go('home');
      return;
    }

    const blocks = [];
    for (const m of teacherClasses) {
      const cls = m.classes || { id: m.class_id, title: '(無題)' };
      const classId = cls.id || m.class_id;
      let events = [];
      try {
        events = await adapter.fetchClassEvents(classId);
      } catch (e) {
        blocks.push(`<div class="card"><h3>${escapeHtml(cls.title || '')}</h3>
          <p class="wrong-text">読取拒否/失敗: ${escapeHtml(e.message)}</p></div>`);
        continue;
      }
      const studentIds = [...new Set(events.map((e) => e.studentId).filter(Boolean))];
      const summary = buildClassSummary(events, studentIds, data.days || []);
      const rows = summary.students
        .map(
          (s) => `<tr>
            <td><code>${escapeHtml(s.studentId.slice(0, 8))}…</code></td>
            <td>${s.lessonsVisitedCount}</td>
            <td>${s.lessonsCompletedCount}</td>
            <td>${s.quizAttempts}（正答率 ${s.quizCorrectRate == null ? '—' : Math.round(s.quizCorrectRate * 100) + '%'}）</td>
            <td>${s.cardRatings}</td>
            <td>${s.lastActivityJst ? escapeHtml(s.lastActivityJst) : '—'}</td>
          </tr>`,
        )
        .join('');
      blocks.push(`
        <div class="card" data-class-id="${escapeHtml(classId)}">
          <h3>${escapeHtml(cls.title || 'クラス')}</h3>
          <p class="muted">活動のある生徒 ${summary.studentsWithActivity} / イベント由来 ${summary.classSize}人 · 練習スコア（監督試験ではありません）</p>
          ${
            summary.classSize
              ? `<div style="overflow:auto;"><table style="width:100%;border-collapse:collapse;font-size:.9rem;">
            <thead><tr>
              <th align="left">UID</th><th>訪問</th><th>完了</th><th>小テスト</th><th>カード</th><th>最終活動 (JST)</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table></div>`
              : `<p class="muted">まだ進捗イベントがありません（デモ生徒は入れません）。</p>`
          }
          <form class="add-student" style="margin-top:.8rem;display:flex;gap:.5rem;flex-wrap:wrap;align-items:end;">
            <label style="flex:1;min-width:12rem;">生徒 UID（auth UUID）
              <input name="studentUid" required pattern="[0-9a-fA-F-]{36}" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" style="width:100%;padding:.4rem;font:inherit;" />
            </label>
            <button type="submit" class="btn secondary">生徒を追加</button>
          </form>
          <p class="muted add-msg" style="margin-top:.4rem;"></p>
        </div>`);
    }

    root.innerHTML = `
      <h2>教師ダッシュボード</h2>
      <p class="muted">表示は RLS 経由の実データのみ。最終活動は ${formatJst(new Date().toISOString())} 基準の JST 表示。自己申告で教師になれません。</p>
      <div class="card">
        <h3>クラス作成</h3>
        <p class="muted">オーナーが <code>private.grant_teacher</code> 済みの場合のみ成功します。</p>
        <form id="create-class" style="display:flex;gap:.5rem;flex-wrap:wrap;align-items:end;">
          <label style="flex:1;min-width:12rem;">タイトル
            <input name="title" required maxlength="200" style="width:100%;padding:.4rem;font:inherit;" />
          </label>
          <button type="submit" class="btn">クラス作成</button>
        </form>
        <p id="create-msg" class="muted" style="margin-top:.4rem;"></p>
      </div>
      ${
        teacherClasses.length
          ? blocks.join('')
          : `<div class="card"><p>このアカウントに教師クラスがありません。</p>
          <p class="muted">UID: <code>${escapeHtml(session.studentId)}</code></p>
          <p class="muted">オーナーが SQL で <code>select private.grant_teacher('&lt;uid&gt;');</code> を実行し、その後上のフォームでクラス作成。</p></div>`
      }
      <button type="button" class="btn ghost" data-home>ホームへ</button>`;

    root.querySelector('[data-home]').onclick = () => go('home');

    const createForm = root.querySelector('#create-class');
    if (createForm) {
      createForm.onsubmit = async (ev) => {
        ev.preventDefault();
        const title = String(new FormData(ev.target).get('title') || '').trim();
        const msg = root.querySelector('#create-msg');
        msg.textContent = '作成中…';
        try {
          await adapter.createClass(title);
          msg.textContent = '作成しました。再読込します。';
          run();
        } catch (e) {
          msg.textContent = `失敗: ${e?.message || e}（grant_teacher 未実施の可能性）`;
        }
      };
    }

    root.querySelectorAll('form.add-student').forEach((form) => {
      form.onsubmit = async (ev) => {
        ev.preventDefault();
        const card = form.closest('[data-class-id]');
        const classId = card?.getAttribute('data-class-id');
        const uid = String(new FormData(form).get('studentUid') || '').trim();
        const msg = card?.querySelector('.add-msg');
        if (!classId) return;
        if (uid.includes('@')) {
          if (msg) msg.textContent = 'メール不可。auth UID のみ。';
          return;
        }
        if (msg) msg.textContent = '追加中…';
        try {
          await adapter.addClassStudent(classId, uid);
          if (msg) msg.textContent = '追加しました。';
          run();
        } catch (e) {
          if (msg) msg.textContent = `失敗: ${e?.message || e}`;
        }
      };
    });
  };

  run();
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
