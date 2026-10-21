-- MIR_Prep · Acceso exclusivo a la cuenta privada.
-- Crear primero la cuenta desde Authentication > Users > Add user > Create new user.
-- Email interno: esthermolinero@users.mir-prep.invalid. Activar Auto Confirm User.
-- Usar la contraseña indicada por el propietario; no se guarda en este archivo.
-- Desactivar también Allow new users to sign up en Authentication > Sign In / Providers.
-- No se eliminan usuarios, perfiles ni intentos anteriores.
begin;
do $mir_account_guard$
begin
  if not exists (select 1 from auth.users where lower(email) = 'esthermolinero@users.mir-prep.invalid' and email_confirmed_at is not null) then
    raise exception 'Crea y confirma primero la cuenta privada desde Authentication > Users. No se ha cambiado el acceso.';
  end if;
end;
$mir_account_guard$;

create or replace function public.mir_has_access() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.users u
    where u.id = auth.uid() and lower(u.email) = 'esthermolinero@users.mir-prep.invalid'
      and u.email_confirmed_at is not null
  );
$$;
revoke all on function public.mir_has_access() from public, anon, authenticated;
grant execute on function public.mir_has_access() to authenticated;

drop policy if exists "Cuenta privada MIR_Prep" on public.profiles;
create policy "Cuenta privada MIR_Prep" on public.profiles as restrictive
for all to authenticated
using ((select public.mir_has_access())) with check ((select public.mir_has_access()));
drop policy if exists "Cuenta privada MIR_Prep" on public.attempts;
create policy "Cuenta privada MIR_Prep" on public.attempts as restrictive
for all to authenticated
using ((select public.mir_has_access())) with check ((select public.mir_has_access()));

create or replace function public.start_exam(p_exam_id text) returns public.attempts
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_exam jsonb;
  v_attempt public.attempts;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.mir_has_access() then raise exception 'ACCESS_DENIED'; end if;
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

create or replace function public.save_attempt(
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
  if not public.mir_has_access() then raise exception 'ACCESS_DENIED'; end if;
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

create or replace function public.submit_attempt(p_attempt_id uuid, p_version integer) returns public.attempts
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
  if not public.mir_has_access() then raise exception 'ACCESS_DENIED'; end if;
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

-- Restaurar explícitamente los permisos tras reemplazar las funciones.
revoke all on function public.start_exam(text) from public, anon, authenticated;
revoke all on function public.save_attempt(uuid, jsonb, jsonb, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.submit_attempt(uuid, integer) from public, anon, authenticated;
grant execute on function public.start_exam(text) to authenticated;
grant execute on function public.save_attempt(uuid, jsonb, jsonb, integer, integer, integer) to authenticated;
grant execute on function public.submit_attempt(uuid, integer) to authenticated;
update public.profiles set display_name = 'Esther'
where id = (select id from auth.users where lower(email) = 'esthermolinero@users.mir-prep.invalid');
notify pgrst, 'reload schema';
commit;
