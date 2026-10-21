-- MIR_Prep · Ejecutar una vez en el SQL Editor de un proyecto Supabase nuevo.
-- No requiere claves secretas en el navegador. Revisar tests/security.sql antes de producción.
begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.exams (
  id text primary key,
  payload jsonb not null,
  fingerprint text not null,
  created_at timestamptz not null default now()
);
alter table private.exams enable row level security;
revoke all on private.exams from public, anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 80),
  target_date date,
  specialty_goal text not null default '' check (char_length(specialty_goal) <= 120),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
revoke all on public.profiles from public, anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, target_date, specialty_goal) on public.profiles to authenticated;
create policy "Leer mi perfil" on public.profiles for select to authenticated
using (id = (select auth.uid()));
create policy "Editar mi perfil" on public.profiles for update to authenticated
using (id = (select auth.uid())) with check (id = (select auth.uid()));

create function private.create_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, left(coalesce(new.raw_user_meta_data->>'display_name', ''), 80));
  return new;
end;
$$;
revoke all on function private.create_profile() from public, anon, authenticated;
create trigger mir_create_profile after insert on auth.users
for each row execute function private.create_profile();
-- También admite usuarios creados antes de cargar este esquema.
insert into public.profiles (id, display_name)
select id, left(coalesce(raw_user_meta_data->>'display_name', ''), 80) from auth.users
on conflict (id) do nothing;

create table public.attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exam_id text not null references private.exams(id),
  exam jsonb not null,
  status text not null default 'in_progress' check (status in ('in_progress', 'submitted')),
  answers jsonb not null default '{}',
  flagged jsonb not null default '[]',
  current_index integer not null default 0,
  elapsed_seconds integer not null default 0 check (elapsed_seconds between 0 and 31536000),
  version integer not null default 1,
  result jsonb,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz,
  check ((status = 'in_progress' and result is null and submitted_at is null)
      or (status = 'submitted' and result is not null and submitted_at is not null))
);
create index attempts_user_updated on public.attempts(user_id, updated_at desc);
create unique index attempts_one_draft on public.attempts(user_id, exam_id) where status = 'in_progress';
alter table public.attempts enable row level security;
revoke all on public.attempts from public, anon, authenticated;
-- El cliente solo lee sus intentos; todas las escrituras pasan por RPC.
grant select on public.attempts to authenticated;
create policy "Leer mis intentos" on public.attempts for select to authenticated
using (user_id = (select auth.uid()));

create function public.start_exam(p_exam_id text) returns public.attempts
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_exam jsonb;
  v_attempt public.attempts;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select payload->'exam' into v_exam from private.exams where id = p_exam_id;
  if v_exam is null then raise exception 'EXAM_NOT_FOUND'; end if;
  insert into public.attempts (user_id, exam_id, exam)
  values (v_uid, p_exam_id, v_exam)
  on conflict (user_id, exam_id) where status = 'in_progress' do nothing;
  select * into v_attempt from public.attempts
  where user_id = v_uid and exam_id = p_exam_id and status = 'in_progress';
  return v_attempt;
end;
$$;

create function public.save_attempt(
  p_attempt_id uuid, p_answers jsonb, p_flagged jsonb,
  p_current_index integer, p_elapsed_seconds integer, p_version integer
) returns public.attempts
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_attempt public.attempts;
  v_entry record;
  v_question jsonb;
  v_flag jsonb;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_attempt from public.attempts
    where id = p_attempt_id and user_id = v_uid for update;
  if not found then raise exception 'ATTEMPT_NOT_FOUND'; end if;
  if v_attempt.status <> 'in_progress' then raise exception 'ALREADY_SUBMITTED'; end if;
  if p_version is null or p_version <> v_attempt.version then raise exception 'VERSION_CONFLICT'; end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then raise exception 'INVALID_ANSWERS'; end if;
  if p_flagged is null or jsonb_typeof(p_flagged) <> 'array' then raise exception 'INVALID_FLAGS'; end if;
  if octet_length(p_answers::text) > 100000 or octet_length(p_flagged::text) > 100000 then raise exception 'PAYLOAD_TOO_LARGE'; end if;
  for v_entry in select * from jsonb_each(p_answers) loop
    select q into v_question from jsonb_array_elements(v_attempt.exam->'questions') q
      where q->>'id' = v_entry.key;
    if v_question is null then raise exception 'INVALID_QUESTION'; end if;
    if v_entry.value <> 'null'::jsonb and not exists (
      select 1 from jsonb_array_elements(v_question->'options') o where o->'id' = v_entry.value
    ) then raise exception 'INVALID_OPTION'; end if;
  end loop;
  for v_flag in select * from jsonb_array_elements(p_flagged) loop
    if not exists (select 1 from jsonb_array_elements(v_attempt.exam->'questions') q where q->'id' = v_flag)
      then raise exception 'INVALID_FLAG'; end if;
  end loop;
  if p_current_index is null or p_current_index < 0 or p_current_index >= jsonb_array_length(v_attempt.exam->'questions')
    then raise exception 'INVALID_INDEX'; end if;
  if p_elapsed_seconds is null or p_elapsed_seconds < 0 or p_elapsed_seconds > 31536000
    then raise exception 'INVALID_TIME'; end if;
  update public.attempts set answers = p_answers, flagged = p_flagged,
    current_index = p_current_index, elapsed_seconds = greatest(elapsed_seconds, p_elapsed_seconds),
    version = version + 1, updated_at = now()
  where id = p_attempt_id returning * into v_attempt;
  return v_attempt;
end;
$$;

create function public.submit_attempt(p_attempt_id uuid, p_version integer) returns public.attempts
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_attempt public.attempts;
  v_solutions jsonb;
  v_q jsonb;
  v_solution jsonb;
  v_answer text;
  v_correct integer := 0;
  v_incorrect integer := 0;
  v_blank integer := 0;
  v_voided integer := 0;
  v_points integer;
  v_details jsonb := '[]';
  v_outcome text;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_attempt from public.attempts
    where id = p_attempt_id and user_id = v_uid for update;
  if not found then raise exception 'ATTEMPT_NOT_FOUND'; end if;
  -- Idempotente: si el navegador reintenta tras perder la respuesta, no corrige dos veces.
  if v_attempt.status = 'submitted' then return v_attempt; end if;
  if p_version is null or p_version <> v_attempt.version then raise exception 'VERSION_CONFLICT'; end if;
  select payload->'solutions' into v_solutions from private.exams where id = v_attempt.exam_id;
  if v_solutions is null then raise exception 'SOLUTIONS_NOT_FOUND'; end if;
  for v_q in select * from jsonb_array_elements(v_attempt.exam->'questions') loop
    v_solution := v_solutions->(v_q->>'id');
    v_answer := v_attempt.answers->>(v_q->>'id');
    if coalesce((v_q->>'voided')::boolean, false) then
      v_voided := v_voided + 1;
      v_outcome := 'voided';
    elsif not (v_attempt.answers ? (v_q->>'id')) then
      raise exception 'UNRESOLVED_QUESTIONS';
    elsif v_answer is null then
      v_blank := v_blank + 1;
      v_outcome := 'blank';
    elsif v_answer = v_solution->>'correctOptionId' then
      v_correct := v_correct + 1;
      v_outcome := 'correct';
    else
      v_incorrect := v_incorrect + 1;
      v_outcome := 'incorrect';
    end if;
    v_details := v_details || jsonb_build_array(jsonb_build_object(
      'questionId', v_q->>'id', 'answer', v_answer,
      'correctOptionId', v_solution->>'correctOptionId',
      'explanation', v_solution->>'explanation', 'outcome', v_outcome
    ));
  end loop;
  v_points := v_correct * (v_attempt.exam->'scoring'->>'correct')::integer
    + v_incorrect * (v_attempt.exam->'scoring'->>'incorrect')::integer;
  update public.attempts set status = 'submitted', submitted_at = now(), updated_at = now(),
    version = version + 1,
    result = jsonb_build_object(
      'correct', v_correct, 'incorrect', v_incorrect, 'blank', v_blank, 'voided', v_voided,
      'total', v_correct + v_incorrect + v_blank, 'points', v_points,
      'maxPoints', (v_correct + v_incorrect + v_blank) * (v_attempt.exam->'scoring'->>'correct')::integer,
      'net', round(v_points::numeric / (v_attempt.exam->'scoring'->>'correct')::integer, 2),
      'details', v_details
    )
  where id = p_attempt_id returning * into v_attempt;
  return v_attempt;
end;
$$;

-- PostgreSQL concede EXECUTE a PUBLIC por defecto: revocarlo expresamente.
revoke all on function public.start_exam(text) from public, anon, authenticated;
revoke all on function public.save_attempt(uuid, jsonb, jsonb, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.submit_attempt(uuid, integer) from public, anon, authenticated;
grant execute on function public.start_exam(text) to authenticated;
grant execute on function public.save_attempt(uuid, jsonb, jsonb, integer, integer, integer) to authenticated;
grant execute on function public.submit_attempt(uuid, integer) to authenticated;
commit;
