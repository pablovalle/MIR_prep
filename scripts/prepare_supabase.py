"""Prepare a single, atomic first-install SQL script for the Supabase SQL Editor."""
from pathlib import Path
import re
import build as mir_build

ROOT = Path(__file__).resolve().parent.parent


def unwrap_transaction(sql):
    start = re.search(r"(?m)^[ \t]*begin;[ \t]*$", sql)
    end = re.search(r"(?m)^[ \t]*commit;[ \t]*\s*\Z", sql)
    if not start or not end or start.start() >= end.start():
        raise ValueError("El archivo SQL debe incluir una transacción completa begin/commit")
    return (sql[:start.start()] + sql[start.end():end.start()]).strip()


def setup_sql(schema, exams):
    return """-- MIR_Prep · Instalación inicial, en una única transacción.
-- Proyecto previsto: lwkbrhjrvpdrqfiszyxr
-- Ejecutar en: https://supabase.com/dashboard/project/lwkbrhjrvpdrqfiszyxr/sql/new
-- No borra ni sustituye tablas existentes. Si hay una instalación previa, se detiene.
begin;
do $mir_install_guard$
begin
  if to_regclass('public.profiles') is not null
    or to_regclass('public.attempts') is not null
    or to_regnamespace('private') is not null then
    raise exception 'MIR_Prep: ya existen tablas o un esquema private. Instalación detenida sin cambios; revisa la estructura existente antes de migrar.';
  end if;
end;
$mir_install_guard$;

""" + unwrap_transaction(schema) + "\n\n" + unwrap_transaction(exams) + """

notify pgrst, 'reload schema';
commit;
-- Instalación terminada. Los datos reales siguen protegidos por RLS y permisos.
"""


if __name__ == "__main__":
    mir_build.build(include_sql=True)
    schema = (ROOT / "supabase" / "schema.sql").read_text(encoding="utf-8")
    exams = (ROOT / "supabase" / "import.sql").read_text(encoding="utf-8")
    output = ROOT / "supabase" / "setup.sql"
    output.write_text(setup_sql(schema, exams), encoding="utf-8")
    print("Instalacion preparada: supabase/setup.sql")
    print("SQL Editor: https://supabase.com/dashboard/project/lwkbrhjrvpdrqfiszyxr/sql/new")
