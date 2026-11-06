# Live RLS proof — Business Career Class (`wtgvcdxuxebzgdfrrfbj`)

Ran 2026-11-06 against production Postgres via Supabase `execute_sql`.
Transaction-scoped fixtures (2 students + 2 teachers + 2 classes), JWT claims via
`request.jwt.claim.sub` / `set local role`, then **ROLLBACK**. No Auth API calls,
no emails, no persistent roster.

| test_id | ok | detail |
|---------|----|--------|
| anon_deny_progress_select | true | anon saw 0 |
| anon_deny_progress_insert | true | blocked |
| student_sees_own | true | count=2 |
| peer_deny_by_id | true | ok |
| spoof_user_id_insert_deny | true | blocked |
| client_membership_insert_deny | true | blocked |
| client_role_escalate_deny | true | role=student |
| teacher_a_class_a_ok | true | classA=2 |
| teacher_a_class_b_deny | true | classB=0 |
| teacher_registry_not_global_read | true | sawClassA=0 |
| append_only_no_update_delete | true | upd=0 del=0 |
| student_create_class_deny | true | blocked |
| teacher_create_class_ok | true | created |
| client_grant_teacher_deny | true | blocked |
| event_id_idempotent_pk | true | unique enforced |

Post-rollback counts: events=0, members=0, classes=0, teachers=0, fake_users=0.

Security advisors after apply:
- INFO: `private.teacher_registry` RLS on, no policies — **intentional** (deny-all clients).
- WARN: `create_class` / `add_class_student` SECURITY DEFINER executable by authenticated —
  **intentional**; functions enforce `private.is_teacher()` / `private.is_class_teacher()` and
  are the only allowed write path for membership.
