import { createSupabaseSyncAdapter } from '../lib/supabase/adapter.js';
import { readSupabaseConfig } from '../lib/supabase/config.js';
import {
  activateAndSync,
  logoutLocal,
  explicitImportAnonymousIntoAccount,
} from '../lib/supabase/sessionBridge.js';
import { ANON_STORAGE_KEY } from '../lib/sync/accountScope.js';
import { setDaysCatalog } from '../lib/storage.js';

/**
 * Native in-app auth (email/password). Forms are inert when Supabase is not configured —
 * they do not call the network, so no confirmation emails fire until a project is connected.
 */
export function renderAuth(root, { go, setState, refreshChip, data }) {
  const cfg = readSupabaseConfig();
  const adapter = createSupabaseSyncAdapter();
  let mode = 'signin'; // signin | signup
  let message = '';
  let busy = false;

  const daysCatalog = data?.days || [];
  if (daysCatalog.length) setDaysCatalog(daysCatalog);

  const draw = async () => {
    let session = null;
    if (cfg.configured) {
      try {
        session = await adapter.getSession();
      } catch {
        session = null;
      }
    }

    if (session) {
      root.innerHTML = `
        <h2>アカウント</h2>
        <div class="card">
          <p>ログイン中（UID）: <code>${escapeHtml(session.studentId)}</code></p>
          <p class="muted">メールは表示用です。識別子は UID のみを使います。</p>
          <p class="muted">${escapeHtml(session.email || '（メール非表示）')}</p>
          <div class="btn-row">
            <button type="button" class="btn secondary" data-logout>ログアウト</button>
            <button type="button" class="btn secondary" data-home>ホームへ</button>
          </div>
          <p class="muted" style="margin-top:.8rem;">ゲスト（匿名）進捗の取り込みは自動では行いません。キー <code>${ANON_STORAGE_KEY}</code> はログインで上書きしません。</p>
          <button type="button" class="btn ghost" data-import-anon>匿名進捗をこのアカウントへ明示的にコピー</button>
          <p id="auth-msg" class="muted"></p>
        </div>`;
      root.querySelector('[data-logout]').onclick = async () => {
        try {
          await adapter.signOut();
        } catch {
          /* still clear local */
        }
        const out = logoutLocal(session.studentId);
        setState?.(out.state);
        refreshChip?.();
        go('auth');
      };
      root.querySelector('[data-home]').onclick = () => go('home');
      root.querySelector('[data-import-anon]').onclick = async () => {
        const r = explicitImportAnonymousIntoAccount(session.studentId, { overwrite: false });
        const msg = root.querySelector('#auth-msg');
        if (r.imported) {
          const { state } = await activateAndSync(session.studentId, { daysCatalog });
          setState?.(state);
          refreshChip?.();
          msg.textContent = 'コピーしました（アカウントキーへ。匿名キーはそのまま）。';
        } else {
          msg.textContent = `スキップ: ${r.reason}`;
        }
      };
      return;
    }

    const statusBanner = cfg.configured
      ? `<p class="muted">接続設定あり（プロジェクト適用・Auth 設定は親の承認後）。</p>`
      : `<div class="warn"><strong>未接続</strong> — Supabase の URL / anon キー未設定のため、フォームは送信しません（メールも飛びません）。ゲスト学習はそのまま使えます。</div>`;

    root.innerHTML = `
      <h2>${mode === 'signin' ? 'ログイン' : '学生サインアップ'}</h2>
      ${statusBanner}
      <div class="card">
        <p class="muted">方式: メール + パスワード（OAuth / マジックリンクなし）。教師ロールはクライアントから申告できません。</p>
        <p class="muted" style="font-size:.9rem;">プライバシー: 収集するのはメール（認証用）と学習イベント（UID・練習記録）のみ。氏名・住所・電話は不要です。デモ生徒データは入れません。ログアウト後もこの端末のゲスト進捗は残ります。</p>
        <form id="auth-form" autocomplete="on">
          <label class="row" style="display:block;margin:.5rem 0;">メール
            <input name="email" type="email" required style="width:100%;padding:.5rem;font:inherit;" ${cfg.configured ? '' : 'disabled'} />
          </label>
          <label class="row" style="display:block;margin:.5rem 0;">パスワード（8文字以上）
            <input name="password" type="password" required minlength="8" style="width:100%;padding:.5rem;font:inherit;" ${cfg.configured ? '' : 'disabled'} />
          </label>
          <div class="btn-row">
            <button type="submit" class="btn" ${cfg.configured && !busy ? '' : 'disabled'}>${mode === 'signin' ? 'ログイン' : 'アカウント作成'}</button>
            <button type="button" class="btn secondary" data-toggle>${mode === 'signin' ? '新規登録へ' : 'ログインへ'}</button>
          </div>
        </form>
        <p id="auth-msg" class="muted">${escapeHtml(message)}</p>
        <p class="muted"><button type="button" class="btn ghost" data-guest>ゲストのまま続ける</button></p>
      </div>`;

    root.querySelector('[data-toggle]').onclick = () => {
      mode = mode === 'signin' ? 'signup' : 'signin';
      message = '';
      draw();
    };
    root.querySelector('[data-guest]').onclick = () => go('home');
    root.querySelector('#auth-form').onsubmit = async (ev) => {
      ev.preventDefault();
      if (!cfg.configured) {
        message = '未接続のため送信しません。';
        draw();
        return;
      }
      const fd = new FormData(ev.target);
      const email = String(fd.get('email') || '').trim();
      const password = String(fd.get('password') || '');
      busy = true;
      message = '';
      draw();
      try {
        if (mode === 'signin') {
          const s = await adapter.signIn({ email, password });
          const { state } = await activateAndSync(s.studentId, { daysCatalog });
          setState?.(state);
        } else {
          const s = await adapter.signUp({ email, password });
          if (s.studentId && !s.needsEmailConfirmation) {
            const { state } = await activateAndSync(s.studentId, { daysCatalog });
            setState?.(state);
          } else {
            message =
              '確認メールの設定により、メール確認が必要な場合があります（プロジェクト Auth 設定を確認）。';
            busy = false;
            draw();
            return;
          }
        }
        refreshChip?.();
        go('home');
      } catch (e) {
        message = e?.message || String(e);
        busy = false;
        draw();
      }
    };
  };

  draw();
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
