# BC3 Study App — Stage 1: Sign-in, synced progress, teacher dashboard

**Status:** Local preparatory modules only. **No backend chosen. No commit/push/deploy of cloud wiring. Cloud sync does not work yet.**

Date: 2026-11-06 (Asia/Tokyo)

## Goals (Jun)

- Student sign-in + synced progress across devices
- Teacher class dashboard (completion, quiz practice results, self-rated cards, last activity)
- Security-first: stable auth IDs, DB-enforced isolation, no admin keys in frontend/GitHub

## Current app integration points (unchanged UI)

| Hook | File | Today | Future event |
|------|------|-------|--------------|
| Open day page | `src/views/days.js` `touchDay` | visit only | `lesson_visited` |
| Quiz check | `days.js` / `exams.js` `recordQuestion` | local attempts | `quiz_answer` (practiceOnly) |
| Card rate | `days.js` / `flashcards.js` `recordCard` | SRS local | `card_rating` (selfRated) |
| Persist | `src/lib/storage.js` `bc3-study-v1` | single anonymous key | keep + per-account keys |
| Progress UI | `src/views/progress.js` | local counts | later: signed-in summary |
| Settings export | `settings.js` | JSON backup | optional explicit import into account |

Live views **do not** import `src/lib/sync/*` yet — Stage 1 is library + tests + this design.

## Modules added (provider-neutral)

- `src/lib/sync/events.js` — append-only event schema, UUID idempotency
- `src/lib/sync/time.js` — UTC store, JST display (`Asia/Tokyo`)
- `src/lib/sync/lessonCompletion.js` — completion ≠ visited
- `src/lib/sync/merge.js` — multi-device merge without last-write-loss
- `src/lib/sync/summaries.js` — student/class aggregates (no synthetic students)
- `src/lib/sync/accountScope.js` — per-UID local cache; logout clears account only; anonymous preserved; **no auto-import**
- `src/lib/sync/adapter.js` — null adapter until Supabase/Firebase approved

## Lesson completion definition (default)

1. **Visited:** day page opened → `lesson_visited` / existing `daysTouched` (not completion).
2. **Completed:** for that day’s banks:
   - every `question_ids` entry has ≥1 quiz attempt, and
   - every `card_ids` entry has ≥1 self-rating (skipped for `kind==='mock'`, questions only).
3. Optional explicit `lesson_completed` event when criteria met (client or server-side job).

## Security requirements (must hold on any provider)

1. **Identity:** auth UID only in routes/APIs — never email as URL param or client primary key.
2. **Authorization:** class membership + teacher access enforced in **database RLS / security rules**, not by hiding UI.
3. **Students** cannot set their own `role`, invent membership, or query other students’ events.
4. **No** service-role / Admin SDK keys in frontend, Pages build, or GitHub.
5. **No** fake sample students mixed into real class rosters.
6. **Anonymous** browser progress stays on `bc3-study-v1`; import into a signed-in account only via **explicit** user action (`explicitImportAnonymousIntoAccount`).
7. On logout: clear that account’s local cache + session; **preserve** anonymous key.
8. Quiz scores are **practice** on a public question bank — not a proctored-exam claim.

## Proposed data model (provider-agnostic)

Tables / collections (names illustrative):

- `profiles` — `uid` PK, display name, created_at (role **not** client-writable; use `class_members.role`)
- `classes` — `id`, `teacher_uid`, title, created_at
- `class_members` — `class_id`, `uid`, `role` ∈ {student, teacher}, PK (class_id, uid); **only teacher/admin server paths insert**
- `progress_events` — `id` UUID PK (client idempotency), `uid`, `class_id` nullable, `type`, `occurred_at` timestamptz UTC, `payload` jsonb, `device_id`

RLS sketch (Supabase-style; Firebase equivalent rules):

- select own events: `auth.uid() = uid`
- insert own events: `auth.uid() = uid` AND type in allowlist AND payload size limits
- teacher select: `exists class_members where class_id = events.class_id and uid = auth.uid() and role = teacher`
- deny update/delete of events (append-only) except service maintenance

## Offline / multi-device

- Each event has client UUID `id`; push is upsert-by-id.
- Merge is append-only; duplicates ignored; distinct attempts retained (no silent last-write wipe of history).
- Derived SRS maps can be recomputed from events; until wired, local scheduler state remains authoritative offline.

## UI (later stages — not built now)

- True login screen in this app (not Canvas).
- Teacher dashboard route gated by membership check that **fails closed** if rules deny.
- No outbound class invitations/email/payments in Stage 1.

## Parent must configure (before Stage 2)

1. Choose provider: **Supabase** or **Firebase** (or other) per install rules — **not approved yet**.
2. Create project; enable email/OIDC auth as desired.
3. Apply migrations/rules above; **never** ship service role to Pages.
4. Install only the **client** SDK via approved connector/dependency path.
5. Set public anon/API key as build env (rotatable); document in private ops notes, not in student-facing UI.
6. Decide class provisioning (teacher creates class + adds student UIDs manually vs invite codes with server validation).
7. Confirm whether Pages static hosting needs auth redirect allowlist.

## Auth / row-isolation test plan (Stage 2+)

Automated (emulator or staging):

1. Student A cannot `select` Student B events.
2. Student cannot `update` `class_members.role` to teacher.
3. Student cannot `insert` membership for another class.
4. Teacher of class X can read X members’ events; teacher of Y cannot read X.
5. Unauthenticated cannot read any `progress_events`.
6. Insert with spoofed `uid` ≠ `auth.uid()` rejected.
7. Duplicate event `id` upsert does not duplicate rows / does not 500.
8. Logout clears account local key; anonymous key still present.
9. Login without explicit import leaves account progress empty even if anonymous has data.

Manual:

1. Two browsers, same student UID — both quiz attempts appear after sync.
2. Teacher dashboard shows practice disclaimer.
3. Deep link with `?email=` ignored for identity.

## What Stage 1 does **not** claim

- Cloud sync works
- Teacher dashboard is usable in production
- Any connector is installed
- Anonymous and signed-in data are already merged

## Local verification

```bash
npm test   # includes tests/syncStage1.test.js
```


## Update 2026-11-06 afternoon

Provider **Supabase** confirmed. Client adapter + auth/teacher UI + migration file added locally. **No project created; migration not applied; no git push/deploy.** See `docs/supabase-setup.md`.
