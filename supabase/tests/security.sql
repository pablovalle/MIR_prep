-- Ejecutar en el SQL Editor de un proyecto DE PRUEBAS después de schema.sql e import.sql.
-- No necesita pgTAP. Cualquier fallo aborta; todo se revierte al terminar.
begin;

do $$
declare v_alice uuid := gen_random_uuid(); v_bob uuid := gen_random_uuid();
begin
  if not exists (select 1 from private.exams where id = 'demo-v1') then
    raise exception 'Importa demo-v1 antes de ejecutar estas pruebas';
  end if;
  perform set_config('mirtest.alice', v_alice::text, true);
  perform set_config('mirtest.bob', v_bob::text, true);
  insert into auth.users (id, email, raw_user_meta_data) values
    (v_alice, v_alice::text || '@example.test', '{"display_name":"Alice TEST"}'),
    (v_bob, v_bob::text || '@example.test', '{"display_name":"Bob TEST"}');
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('mirtest.alice'), true);
do $$
declare a public.attempts; b public.attempts; v_profiles integer;
begin
  select count(*) into v_profiles from public.profiles;
  if v_profiles <> 1 then raise exception 'TEST_FAIL: Alice solo debe ver su perfil'; end if;
  a := public.start_exam('demo-v1');
  perform set_config('mirtest.alice_attempt', a.id::text, true);
  b := public.start_exam('demo-v1');
  if a.id <> b.id then raise exception 'TEST_FAIL: iniciar debe recuperar el borrador'; end if;
  if a.exam::text like '%correctOptionId%' then raise exception 'TEST_FAIL: se filtran soluciones antes de entregar'; end if;
  a := public.save_attempt(a.id, '{"q1":"a"}', '["q3"]', 2, 90, a.version);
  if a.version <> 2 or a.current_index <> 2 then raise exception 'TEST_FAIL: guardado'; end if;
  begin
    perform public.save_attempt(a.id, '{}', '[]', 0, 0, 1);
    raise exception 'TEST_FAIL: debe rechazar una versión anterior';
  exception when others then if sqlerrm <> 'VERSION_CONFLICT' then raise; end if; end;
  begin
    perform public.save_attempt(a.id, '{"q1":"unknown"}', '[]', 0, 90, a.version);
    raise exception 'TEST_FAIL: debe rechazar una opción inventada';
  exception when others then if sqlerrm <> 'INVALID_OPTION' then raise; end if; end;
  begin
    perform public.submit_attempt(a.id, a.version);
    raise exception 'TEST_FAIL: no puede entregar preguntas sin resolver';
  exception when others then if sqlerrm <> 'UNRESOLVED_QUESTIONS' then raise; end if; end;
  a := public.save_attempt(a.id, '{"q1":"a","q2":"b","q3":"a","q4":null}', '["q3"]', 3, 120, a.version);
  a := public.submit_attempt(a.id, a.version);
  if a.status <> 'submitted' or a.result->>'points' <> '5' or a.result->>'net' <> '1.67'
    or a.result->>'blank' <> '1' then raise exception 'TEST_FAIL: corrección'; end if;
  b := public.submit_attempt(a.id, 1);
  if b.result <> a.result then raise exception 'TEST_FAIL: entrega no idempotente'; end if;
  begin
    perform public.save_attempt(a.id, '{}', '[]', 0, 0, a.version);
    raise exception 'TEST_FAIL: un intento entregado es inmutable';
  exception when others then if sqlerrm <> 'ALREADY_SUBMITTED' then raise; end if; end;
  begin
    update public.attempts set result = '{"points":999}' where id = a.id;
    raise exception 'TEST_FAIL: escritura directa debe estar prohibida';
  exception when insufficient_privilege then null; end;
  begin
    perform payload from private.exams;
    raise exception 'TEST_FAIL: soluciones privadas accesibles';
  exception when insufficient_privilege then null; end;
end;
$$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('mirtest.bob'), true);
do $$
declare v_count integer; a public.attempts;
begin
  select count(*) into v_count from public.attempts;
  if v_count <> 0 then raise exception 'TEST_FAIL: Bob ve intentos de Alice'; end if;
  select count(*) into v_count from public.profiles where id = current_setting('mirtest.alice')::uuid;
  if v_count <> 0 then raise exception 'TEST_FAIL: Bob ve el perfil de Alice'; end if;
  update public.profiles set display_name = 'intruso' where id = current_setting('mirtest.alice')::uuid;
  get diagnostics v_count = row_count;
  if v_count <> 0 then raise exception 'TEST_FAIL: Bob edita a Alice'; end if;
  begin
    perform public.save_attempt(current_setting('mirtest.alice_attempt')::uuid, '{}', '[]', 0, 0, 1);
    raise exception 'TEST_FAIL: Bob guarda el intento de Alice';
  exception when others then if sqlerrm <> 'ATTEMPT_NOT_FOUND' then raise; end if; end;
  begin
    perform public.submit_attempt(current_setting('mirtest.alice_attempt')::uuid, 1);
    raise exception 'TEST_FAIL: Bob entrega el intento de Alice';
  exception when others then if sqlerrm <> 'ATTEMPT_NOT_FOUND' then raise; end if; end;
  a := public.start_exam('demo-v1');
  if a.user_id <> current_setting('mirtest.bob')::uuid then raise exception 'TEST_FAIL: propietario incorrecto'; end if;
end;
$$;

reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
do $$
begin
  begin
    perform * from public.attempts;
    raise exception 'TEST_FAIL: acceso anónimo a intentos';
  exception when insufficient_privilege then null; end;
  begin
    perform * from public.profiles;
    raise exception 'TEST_FAIL: acceso anónimo a perfiles';
  exception when insufficient_privilege then null; end;
  begin
    perform public.start_exam('demo-v1');
    raise exception 'TEST_FAIL: función disponible para anon';
  exception when insufficient_privilege then null; end;
end;
$$;
reset role;
rollback;
-- Si no aparece ningún ERROR, las comprobaciones han pasado y no se conserva ningún dato de prueba.
