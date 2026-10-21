-- Instalación única. scripts/configure_publish.py puede ejecutarla con un token personal.
-- La clave secreta del proyecto se usará después únicamente para llamar a esta función.
begin;

create or replace function public.import_mir_exams(p_exams jsonb, p_dry_run boolean default false)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_entry jsonb;
  v_question jsonb;
  v_solution jsonb;
  v_id text;
  v_existing text;
  v_imported integer := 0;
  v_unchanged integer := 0;
  v_pending integer := 0;
  v_seen text[] := '{}';
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'ACCESS_DENIED'; end if;
  if p_dry_run is null or p_exams is null or jsonb_typeof(p_exams) <> 'array'
    then raise exception 'INVALID_IMPORT'; end if;
  if jsonb_array_length(p_exams) > 1000 or octet_length(p_exams::text) > 20000000
    then raise exception 'IMPORT_TOO_LARGE'; end if;

  -- Serializa importaciones concurrentes. Se comprueba todo antes de escribir.
  perform pg_catalog.pg_advisory_xact_lock(70652531120491::bigint);
  for v_entry in select * from jsonb_array_elements(p_exams) loop
    v_id := v_entry->>'id';
    if v_id is null or v_id !~ '^[a-zA-Z0-9_-]{1,80}$' or v_id = any(v_seen)
      or coalesce(v_entry->>'fingerprint', '') !~ '^[a-f0-9]{64}$'
      or jsonb_typeof(v_entry->'payload'->'exam') is distinct from 'object'
      or jsonb_typeof(v_entry->'payload'->'solutions') is distinct from 'object'
      or v_entry->'payload'->'exam'->>'id' is distinct from v_id
      or jsonb_typeof(v_entry->'payload'->'exam'->'questions') is distinct from 'array'
      then raise exception 'INVALID_IMPORT'; end if;
    v_seen := array_append(v_seen, v_id);
    if jsonb_array_length(v_entry->'payload'->'exam'->'questions') not between 1 and 500
      then raise exception 'INVALID_IMPORT'; end if;
    for v_question in select * from jsonb_array_elements(v_entry->'payload'->'exam'->'questions') loop
      v_solution := v_entry->'payload'->'solutions'->(v_question->>'id');
      if jsonb_typeof(v_question->'options') is distinct from 'array'
        or nullif(v_solution->>'explanation', '') is null
        then raise exception 'INVALID_IMPORT'; end if;
      if not exists (select 1 from jsonb_array_elements(v_question->'options') o
        where o->>'id' = v_solution->>'correctOptionId')
        then raise exception 'INVALID_IMPORT'; end if;
    end loop;
    select fingerprint into v_existing from private.exams where id = v_id;
    if found then
      if v_existing <> v_entry->>'fingerprint' then
        raise exception 'EXAM_VERSION_CONFLICT: %', v_id;
      end if;
      v_unchanged := v_unchanged + 1;
    else
      v_pending := v_pending + 1;
    end if;
  end loop;

  if not p_dry_run then
    for v_entry in select * from jsonb_array_elements(p_exams) loop
      if not exists (select 1 from private.exams where id = v_entry->>'id') then
        insert into private.exams (id, payload, fingerprint)
          values (v_entry->>'id', v_entry->'payload', v_entry->>'fingerprint');
        v_imported := v_imported + 1;
      end if;
    end loop;
  end if;
  return jsonb_build_object('imported', v_imported, 'unchanged', v_unchanged,
    'pending', case when p_dry_run then v_pending else 0 end);
end;
$$;

revoke all on function public.import_mir_exams(jsonb, boolean) from public, anon, authenticated;
grant execute on function public.import_mir_exams(jsonb, boolean) to service_role;
notify pgrst, 'reload schema';
commit;
