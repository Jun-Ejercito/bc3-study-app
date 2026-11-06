# Live RLS / RPC proof — `wtgvcdxuxebzgdfrrfbj`

## Round 2 — after `harden_public_rpc_invoker` (2026-11-06)

Transaction fixtures + JWT claims + **ROLLBACK**. No Auth API, no emails, no persistent roster.

| test_id | ok |
|---------|----|
| public_create_class_is_invoker | true |
| private_create_class_is_definer | true |
| anon_deny_progress_select | true |
| anon_deny_progress_insert | true |
| student_sees_own | true |
| peer_deny_by_id | true |
| spoof_user_id_insert_deny | true |
| client_membership_insert_deny | true |
| client_role_escalate_deny | true |
| student_public_create_class_deny | true |
| student_private_create_class_deny | true |
| student_private_add_student_deny | true |
| student_grant_teacher_deny | true |
| teacher_a_class_a_ok | true |
| teacher_a_class_b_deny | true |
| teacher_public_create_class_ok | true |
| teacher_private_create_class_ok | true |
| teacher_grant_teacher_deny | true |
| teacher_registry_not_global_read | true |
| teacher_b_private_add_to_class_a_deny | true |
| append_only_no_update_delete | true |
| event_id_idempotent_pk | true |

**22/22 pass.** Post-rollback: all fixture counts 0.

Security advisors after harden:
- INFO only: `private.teacher_registry` RLS on, no policies (intentional deny-all clients).
- **No** `authenticated_security_definer_function_executable` WARN on public RPCs (cleared).

## Round 1 (pre-harden)

15/15 isolation cases — see git history. Superseded by Round 2.
