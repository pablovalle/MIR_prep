-- Pruebas del importador instalado. Ejecutar con privilegios de SQL Editor.
-- Todo se revierte: ni exámenes de prueba ni cambios en usuarios o intentos.
begin;
do $$
declare v_template jsonb;
begin
  if has_function_privilege('anon', 'public.import_mir_exams(jsonb,boolean)', 'execute')
    or has_function_privilege('authenticated', 'public.import_mir_exams(jsonb,boolean)', 'execute')
    or not has_function_privilege('service_role', 'public.import_mir_exams(jsonb,boolean)', 'execute')
    then raise exception 'TEST_FAIL: permisos del importador'; end if;
  if exists (select 1 from private.exams where id in ('__mir_auto_import_test__', '__mir_auto_atomic_test__'))
    then raise exception 'TEST_FAIL: identificadores de prueba ocupados'; end if;
  select payload into v_template from private.exams where id = 'demo-v1';
  if v_template is null then raise exception 'TEST_FAIL: falta demo-v1'; end if;
  perform set_config('mirtest.import_template', v_template::text, true);
end;
$$;

set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
do $$
begin
  begin
    perform public.import_mir_exams('[]', true);
    raise exception 'TEST_FAIL: usuario de estudio puede importar';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$
declare v_payload jsonb; v_entry jsonb; v_second jsonb; v_result jsonb;
begin
  v_payload := jsonb_set(current_setting('mirtest.import_template')::jsonb,
    '{exam,id}', '"__mir_auto_import_test__"');
  v_entry := jsonb_build_object('id', '__mir_auto_import_test__', 'payload', v_payload, 'fingerprint', repeat('a', 64));
  v_result := public.import_mir_exams(jsonb_build_array(v_entry), true);
  if v_result->>'pending' <> '1' or v_result->>'imported' <> '0'
    then raise exception 'TEST_FAIL: simulación de importación'; end if;
  v_result := public.import_mir_exams(jsonb_build_array(v_entry));
  if v_result->>'imported' <> '1' then raise exception 'TEST_FAIL: importación'; end if;
  v_result := public.import_mir_exams(jsonb_build_array(v_entry));
  if v_result->>'imported' <> '0' or v_result->>'unchanged' <> '1'
    then raise exception 'TEST_FAIL: idempotencia'; end if;

  -- Un conflicto posterior debe impedir insertar incluso el primer examen del lote.
  v_second := jsonb_build_object('id', '__mir_auto_atomic_test__',
    'payload', jsonb_set(v_payload, '{exam,id}', '"__mir_auto_atomic_test__"'), 'fingerprint', repeat('c', 64));
  begin
    perform public.import_mir_exams(jsonb_build_array(v_second,
      jsonb_set(v_entry, '{fingerprint}', to_jsonb(repeat('b', 64)))));
    raise exception 'TEST_FAIL: se permitió modificar un ID existente';
  exception when others then
    if sqlerrm not like 'EXAM_VERSION_CONFLICT:%' then raise; end if;
  end;
  begin
    perform public.import_mir_exams('{"no":"array"}');
    raise exception 'TEST_FAIL: se permitió un lote inválido';
  exception when others then
    if sqlerrm <> 'INVALID_IMPORT' then raise; end if;
  end;
end;
$$;
reset role;
do $$
begin
  if not exists (select 1 from private.exams where id = '__mir_auto_import_test__')
    or exists (select 1 from private.exams where id = '__mir_auto_atomic_test__')
    then raise exception 'TEST_FAIL: atomicidad'; end if;
end;
$$;
rollback;
select 'OK: permisos, importación, idempotencia, conflictos y atomicidad; sin cambios persistentes' as comprobacion;
