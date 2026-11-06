-- Move SECURITY DEFINER write RPCs out of exposed public schema.
-- Public wrappers are SECURITY INVOKER; privileged bodies live in private.
-- Docs: https://supabase.com/docs/guides/database/postgres/row-level-security
-- "Never create [security definer] in a schema listed under Exposed schemas"

-- ---------------------------------------------------------------------------
-- private.create_class (hardened body)
-- ---------------------------------------------------------------------------
create or replace function private.create_class(p_title text)
returns public.classes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.classes;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if not private.is_teacher() then
    raise exception 'not a verified teacher';
  end if;
  if p_title is null or char_length(trim(p_title)) < 1 or char_length(p_title) > 200 then
    raise exception 'invalid title';
  end if;
  insert into public.classes (title, created_by)
  values (trim(p_title), v_uid)
  returning * into v_row;
  insert into public.class_members (class_id, user_id, role)
  values (v_row.id, v_uid, 'teacher');
  return v_row;
end;
$$;

revoke all on function private.create_class(text) from public, anon;
grant execute on function private.create_class(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- private.add_class_student (hardened body)
-- ---------------------------------------------------------------------------
create or replace function private.add_class_student(p_class_id uuid, p_student_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated';
  end if;
  if not private.is_class_teacher(p_class_id) then
    raise exception 'not class teacher';
  end if;
  if p_student_id is null then
    raise exception 'student uid required';
  end if;
  if exists (
    select 1 from public.class_members
    where class_id = p_class_id and user_id = p_student_id and role = 'teacher'
  ) then
    raise exception 'refusing to alter teacher membership';
  end if;
  insert into public.class_members (class_id, user_id, role)
  values (p_class_id, p_student_id, 'student')
  on conflict (class_id, user_id) do nothing;
end;
$$;

revoke all on function private.add_class_student(uuid, uuid) from public, anon;
grant execute on function private.add_class_student(uuid, uuid) to authenticated, service_role;

-- Authenticated needs schema USAGE to resolve private.* from INVOKER wrappers / RLS helpers.
-- private is NOT in Data API exposed schemas (config: public, graphql_public only).
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------------------
-- Replace public RPCs with SECURITY INVOKER thin wrappers
-- ---------------------------------------------------------------------------
create or replace function public.create_class(p_title text)
returns public.classes
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return private.create_class(p_title);
end;
$$;

revoke all on function public.create_class(text) from public, anon;
grant execute on function public.create_class(text) to authenticated;

create or replace function public.add_class_student(p_class_id uuid, p_student_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.add_class_student(p_class_id, p_student_id);
end;
$$;

revoke all on function public.add_class_student(uuid, uuid) from public, anon;
grant execute on function public.add_class_student(uuid, uuid) to authenticated;

-- grant_teacher remains private + service_role only (unchanged)
revoke all on function private.grant_teacher(uuid, text) from public, anon, authenticated;
grant execute on function private.grant_teacher(uuid, text) to service_role;

comment on function public.create_class(text) is
  'SECURITY INVOKER wrapper; body in private.create_class (DEFINER).';
comment on function public.add_class_student(uuid, uuid) is
  'SECURITY INVOKER wrapper; body in private.add_class_student (DEFINER).';
comment on function private.create_class(text) is
  'SECURITY DEFINER write path; not exposed via Data API schema list.';
comment on function private.add_class_student(uuid, uuid) is
  'SECURITY DEFINER write path; not exposed via Data API schema list.';
