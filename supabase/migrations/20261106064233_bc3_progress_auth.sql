-- BC3 Study App — progress sync + class membership
-- PREPARED ONLY. Do not apply until parent creates/approves the Supabase project.
-- Auth identity: auth.users.id (UUID). Never use email as PK or in client routes.
-- Teacher bootstrap: private.grant_teacher(uid) via service role / SQL editor only.

create extension if not exists "pgcrypto";

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to postgres, service_role;

-- ---------------------------------------------------------------------------
-- Teacher registry (server-side only; never writable by clients)
-- ---------------------------------------------------------------------------
create table private.teacher_registry (
  user_id uuid primary key references auth.users (id) on delete cascade,
  granted_at timestamptz not null default now(),
  note text
);

create or replace function private.is_teacher()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.teacher_registry tr
    where tr.user_id = (select auth.uid())
  );
$$;

revoke all on function private.is_teacher() from public, anon, authenticated;
grant execute on function private.is_teacher() to authenticated, service_role;

-- Owner/ops bootstrap — SERVICE ROLE / SQL editor only (not exposed to PostgREST)
create or replace function private.grant_teacher(p_user_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null then
    raise exception 'user_id required';
  end if;
  insert into private.teacher_registry (user_id, note)
  values (p_user_id, p_note)
  on conflict (user_id) do update set note = excluded.note;
end;
$$;

revoke all on function private.grant_teacher(uuid, text) from public, anon, authenticated;
grant execute on function private.grant_teacher(uuid, text) to service_role;

create or replace function private.revoke_teacher(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from private.teacher_registry where user_id = p_user_id;
end;
$$;

revoke all on function private.revoke_teacher(uuid) from public, anon, authenticated;
grant execute on function private.revoke_teacher(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Classes + membership
-- ---------------------------------------------------------------------------
create table public.classes (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 200),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

create table public.class_members (
  class_id uuid not null references public.classes (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('student', 'teacher')),
  created_at timestamptz not null default now(),
  primary key (class_id, user_id)
);

create index class_members_user_id_idx on public.class_members (user_id);
create index class_members_class_id_idx on public.class_members (class_id);

create or replace function private.is_class_member(p_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.class_members m
    where m.class_id = p_class_id
      and m.user_id = (select auth.uid())
  );
$$;

create or replace function private.is_class_teacher(p_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- Membership only: verified registry enables create_class, not cross-class reads
  select exists (
    select 1 from public.class_members m
    where m.class_id = p_class_id
      and m.user_id = (select auth.uid())
      and m.role = 'teacher'
  );
$$;

revoke all on function private.is_class_member(uuid) from public, anon;
revoke all on function private.is_class_teacher(uuid) from public, anon;
grant execute on function private.is_class_member(uuid) to authenticated, service_role;
grant execute on function private.is_class_teacher(uuid) to authenticated, service_role;

-- Teacher creates a class + self membership as teacher (must already be in teacher_registry)
create or replace function public.create_class(p_title text)
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
  insert into public.classes (title, created_by)
  values (p_title, v_uid)
  returning * into v_row;
  insert into public.class_members (class_id, user_id, role)
  values (v_row.id, v_uid, 'teacher');
  return v_row;
end;
$$;

revoke all on function public.create_class(text) from public, anon;
grant execute on function public.create_class(text) to authenticated;

-- Teacher adds a student by auth UID (never by email in this RPC)
create or replace function public.add_class_student(p_class_id uuid, p_student_id uuid)
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
  -- Do not overwrite an existing teacher membership via this student-add RPC
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

revoke all on function public.add_class_student(uuid, uuid) from public, anon;
grant execute on function public.add_class_student(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Progress events (append-only)
-- ---------------------------------------------------------------------------
create table public.progress_events (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  class_id uuid references public.classes (id) on delete set null,
  type text not null check (type in (
    'lesson_visited', 'lesson_completed', 'quiz_answer', 'card_rating', 'explicit_import'
  )),
  occurred_at timestamptz not null,
  payload jsonb not null default '{}'::jsonb,
  device_id text,
  created_at timestamptz not null default now(),
  constraint progress_events_payload_obj check (jsonb_typeof(payload) = 'object'),
  constraint progress_events_owner_matches check (user_id is not null)
);

create index progress_events_user_occurred_idx
  on public.progress_events (user_id, occurred_at desc);
create index progress_events_class_occurred_idx
  on public.progress_events (class_id, occurred_at desc)
  where class_id is not null;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.classes enable row level security;
alter table public.class_members enable row level security;
alter table public.progress_events enable row level security;

-- classes: members can read; insert only via create_class RPC
create policy classes_select_member on public.classes
  for select to authenticated
  using (private.is_class_member(id));

create policy classes_no_direct_insert on public.classes
  for insert to authenticated
  with check (false);

create policy classes_no_direct_update on public.classes
  for update to authenticated
  using (false);

create policy classes_no_direct_delete on public.classes
  for delete to authenticated
  using (false);

-- class_members: read own membership or as class teacher; no client role writes
create policy class_members_select on public.class_members
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or private.is_class_teacher(class_id)
  );

create policy class_members_no_client_write on public.class_members
  for insert to authenticated
  with check (false);

create policy class_members_no_client_update on public.class_members
  for update to authenticated
  using (false);

create policy class_members_no_client_delete on public.class_members
  for delete to authenticated
  using (false);

-- progress_events: own rows insert/select; teachers select class rows; no update/delete
create policy progress_events_select_own on public.progress_events
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (class_id is not null and private.is_class_teacher(class_id))
  );

create policy progress_events_insert_own on public.progress_events
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (class_id is null or private.is_class_member(class_id))
  );

create policy progress_events_no_update on public.progress_events
  for update to authenticated
  using (false);

create policy progress_events_no_delete on public.progress_events
  for delete to authenticated
  using (false);

-- Explicit denials for anon on all public tables (RLS enabled + no policies = deny,
-- but document intent)
-- anon has no policies → blocked

grant select on public.classes to authenticated;
grant select on public.class_members to authenticated;
grant select, insert on public.progress_events to authenticated;

comment on table public.progress_events is
  'Append-only practice progress. Quiz scores are practice-only, not proctored exams.';
comment on function private.grant_teacher(uuid, text) is
  'SERVICE ROLE ONLY. Bootstrap verified teachers by auth UID after manual verification.';


-- Defense in depth (applied live as teacher_registry_rls): private schema not in Data API,
-- but enable RLS with zero client policies so anon/authenticated cannot read/write.
alter table private.teacher_registry enable row level security;
revoke all on table private.teacher_registry from public, anon, authenticated;
grant all on table private.teacher_registry to postgres, service_role;
