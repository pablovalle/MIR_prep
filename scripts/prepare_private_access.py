"""Prepare a non-destructive migration that restricts MIR_Prep to its private account."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent.parent
ACCOUNT = dict(re.findall(r"export const (ACCOUNT_USERNAME|ACCOUNT_EMAIL) = '([^']+)';", (ROOT / 'src' / 'access.js').read_text(encoding='utf-8')))
ACCOUNT_EMAIL = ACCOUNT['ACCOUNT_EMAIL']


def private_access_sql(schema):
    header = f"""-- MIR_Prep · Acceso exclusivo a la cuenta privada.
-- Crear primero la cuenta desde Authentication > Users > Add user > Create new user.
-- Email interno: {ACCOUNT_EMAIL}. Activar Auto Confirm User.
-- Usar la contraseña indicada por el propietario; no se guarda en este archivo.
-- Desactivar también Allow new users to sign up en Authentication > Sign In / Providers.
-- No se eliminan usuarios, perfiles ni intentos anteriores.
begin;
do $mir_account_guard$
begin
  if not exists (select 1 from auth.users where lower(email) = '{ACCOUNT_EMAIL}' and email_confirmed_at is not null) then
    raise exception 'Crea y confirma primero la cuenta privada desde Authentication > Users. No se ha cambiado el acceso.';
  end if;
end;
$mir_account_guard$;

create or replace function public.mir_has_access() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.users u
    where u.id = auth.uid() and lower(u.email) = '{ACCOUNT_EMAIL}'
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

"""
    bodies = []
    for name in ('start_exam', 'save_attempt', 'submit_attempt'):
        pattern = rf'^create function public\.{name}\([\s\S]*?^\$\$;'
        match = re.search(pattern, schema, flags=re.MULTILINE)
        if not match:
            raise ValueError(f'No se ha encontrado la función {name}')
        function = match.group().replace('create function ', 'create or replace function ', 1)
        guard = "  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;"
        if function.count(guard) != 1:
            raise ValueError(f'No se puede insertar la restricción en {name}')
        function = function.replace(guard, guard + "\n  if not public.mir_has_access() then raise exception 'ACCESS_DENIED'; end if;")
        bodies.append(function)
    footer = f"""
-- Restaurar explícitamente los permisos tras reemplazar las funciones.
revoke all on function public.start_exam(text) from public, anon, authenticated;
revoke all on function public.save_attempt(uuid, jsonb, jsonb, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.submit_attempt(uuid, integer) from public, anon, authenticated;
grant execute on function public.start_exam(text) to authenticated;
grant execute on function public.save_attempt(uuid, jsonb, jsonb, integer, integer, integer) to authenticated;
grant execute on function public.submit_attempt(uuid, integer) to authenticated;
update public.profiles set display_name = 'Esther'
where id = (select id from auth.users where lower(email) = '{ACCOUNT_EMAIL}');
notify pgrst, 'reload schema';
commit;
"""
    return header + '\n\n'.join(bodies) + '\n' + footer


if __name__ == '__main__':
    schema = (ROOT / 'supabase' / 'schema.sql').read_text(encoding='utf-8')
    output = ROOT / 'supabase' / 'private-access.sql'
    output.write_text(private_access_sql(schema), encoding='utf-8')
    print('Acceso privado preparado: supabase/private-access.sql')
