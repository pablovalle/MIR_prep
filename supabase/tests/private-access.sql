-- Ejecutar DESPUÉS de private-access.sql. Todo se revierte, incluido el intento de prueba.
begin;
do $$
declare v_owner uuid; v_other uuid := gen_random_uuid();
begin
  select id into v_owner from auth.users where lower(email) = 'esthermolinero@users.mir-prep.invalid';
  if v_owner is null then raise exception 'Primero crea la cuenta privada'; end if;
  perform set_config('mirtest.owner', v_owner::text, true);
  perform set_config('mirtest.other', v_other::text, true);
  insert into auth.users (id, email, raw_user_meta_data)
  values (v_other, v_other::text || '@example.test', '{"username":"esthermolinero"}');
end;
$$;
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('mirtest.other'), true);
select set_config('request.jwt.claims', jsonb_build_object('sub', current_setting('mirtest.other'), 'role', 'authenticated', 'email', 'intruso@example.test', 'user_metadata', jsonb_build_object('username', 'esthermolinero'))::text, true);
do $$
declare v_count integer;
begin
  if public.mir_has_access() then raise exception 'TEST_FAIL: identidad no autorizada aceptada'; end if;
  select count(*) into v_count from public.profiles;
  if v_count <> 0 then raise exception 'TEST_FAIL: acceso a perfiles'; end if;
  select count(*) into v_count from public.attempts;
  if v_count <> 0 then raise exception 'TEST_FAIL: acceso al historial'; end if;
  begin
    perform public.start_exam('demo-v1');
    raise exception 'TEST_FAIL: inicio permitido';
  exception when others then if sqlerrm <> 'ACCESS_DENIED' then raise; end if; end;
  begin
    perform public.save_attempt('00000000-0000-0000-0000-000000000000', '{}', '[]', 0, 0, 1);
    raise exception 'TEST_FAIL: guardado permitido';
  exception when others then if sqlerrm <> 'ACCESS_DENIED' then raise; end if; end;
  begin
    perform public.submit_attempt('00000000-0000-0000-0000-000000000000', 1);
    raise exception 'TEST_FAIL: entrega permitida';
  exception when others then if sqlerrm <> 'ACCESS_DENIED' then raise; end if; end;
end;
$$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('mirtest.owner'), true);
select set_config('request.jwt.claims', jsonb_build_object('sub', current_setting('mirtest.owner'), 'role', 'authenticated', 'email', 'esthermolinero@users.mir-prep.invalid')::text, true);
do $$
declare a public.attempts; v_count integer;
begin
  if not public.mir_has_access() then raise exception 'TEST_FAIL: cuenta privada bloqueada'; end if;
  select count(*) into v_count from public.profiles;
  if v_count <> 1 then raise exception 'TEST_FAIL: falta el perfil privado'; end if;
  a := public.start_exam('demo-v1');
  a := public.save_attempt(a.id, '{"q1":"a","q2":"b","q3":"a","q4":null}', '[]', 3, 60, a.version);
  a := public.submit_attempt(a.id, a.version);
  if a.result->>'points' <> '5' or a.result->>'net' <> '1.67' then raise exception 'TEST_FAIL: correccion de la cuenta privada'; end if;
end;
$$;
reset role;
rollback;
-- Sin errores = acceso restringido y recorrido del examen correctos. Sin cambios persistentes.
