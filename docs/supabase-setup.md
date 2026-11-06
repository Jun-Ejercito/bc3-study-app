# Supabase setup — Business Career Class (live)

**Org:** Asean-Education (`qcxobmsuowmruhpuwree`) — plan **free**, no paid opt-in tags.  
**Project:** Business Career Class · ref `wtgvcdxuxebzgdfrrfbj` · region `ap-northeast-1` · status ACTIVE_HEALTHY.  
**Ask before ANY paid upgrade.**

## Applied schema

1. `bc3_progress_auth` (remote version `20261106065248`)
2. `teacher_registry_rls` — RLS enabled on `private.teacher_registry` (no client policies)

Live RLS proof: `docs/live-rls-proof.md` (15/15 pass, rolled back).

## Auth (manual Dashboard — no MCP tool for URL allowlist)

Bot **cannot** set Auth URL config via connector. Owner must in Dashboard → Authentication → URL Configuration:

- Site URL: `https://jun-ejercito.github.io/bc3-study-app/`
- Redirect URLs:  
  - `https://jun-ejercito.github.io/bc3-study-app/**`  
  - `http://127.0.0.1:5173/**`
- Email provider: leave **Confirm email** as school policy requires. Do **not** disable silently from automation.
- Auth method: Email + password only (app does not send invites/magic links).

## Client keys

Public only: Project URL + anon/publishable. Wired in GitHub Actions Pages build env and local `.env.local` (gitignored). Never put `service_role` in the app.

## Owner teacher bootstrap (after Jun signs up himself)

1. Jun opens the app → ログイン / 登録 → 新規登録 with **his own** email + password (8+).
2. If Confirm email is on, Jun confirms via his inbox (user action — bot does not send invites).
3. Owner copies Jun’s **auth UID** from Dashboard → Authentication → Users (verify identity out-of-band).
4. SQL editor / service_role only:

```sql
select private.grant_teacher('<JUN_AUTH_UID>'::uuid, 'manual verified owner');
```

5. Jun logs in → 教師ダッシュボード → クラス作成 → add students by **auth UID** (not email).

**Do not** grant teacher to arbitrary first signup or guessed emails. Teacher UI is wired but **not provisioned** until step 4.

## Feature gate

Guest study features remain fully available without login. Without keys the app stays local-only; with live keys, login/sync work; teacher create/add works only after grant_teacher.
