"""Check the configured Supabase without creating accounts or modifying data."""
import json
import sys
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
import build as mir_build


def get(config, path):
    request = Request(config["supabaseUrl"] + path, headers={
        "apikey": config["supabasePublishableKey"],
        "Accept": "application/json",
    })
    try:
        with urlopen(request, timeout=15) as response:
            return response.status, json.load(response)
    except HTTPError as error:
        body = error.read()
        try:
            data = json.loads(body)
        except (ValueError, UnicodeDecodeError):
            data = {}
        return error.code, data


def check(config):
    if not config["supabaseUrl"]:
        print("Falta configurar Supabase en config.local.json.")
        return False
    print("Proyecto:", config["supabaseUrl"])
    healthy = True
    status, _ = get(config, "/auth/v1/health")
    print("Autenticacion:", "OK" if status == 200 else f"ERROR HTTP {status}")
    healthy &= status == 200
    status, settings = get(config, "/auth/v1/settings")
    if status == 200:
        print("Registro en Supabase:", "cerrado" if settings.get("disable_signup") else "habilitado")
        if not settings.get("disable_signup"):
            print("PENDIENTE: desactiva Allow new users to sign up en Authentication > Sign In / Providers.")
            healthy = False
        print("Confirmacion de correo:", "desactivada" if settings.get("mailer_autoconfirm") else "activada")
        print("Registro en esta web:", "habilitado" if config["allowSignup"] else "cerrado")
    else:
        print("Configuracion de Auth: ERROR HTTP", status)
        healthy = False
    for table in ("profiles", "attempts"):
        # Zero rows requested: never retrieve profile IDs or historical answers.
        status, data = get(config, f"/rest/v1/{table}?select=id&limit=0")
        if status in (401, 403) and data.get("code") == "42501":
            print(table + ": acceso anonimo bloqueado (OK)")
        elif status == 404 and data.get("code") == "PGRST205":
            print(table + ": falta instalar la tabla; ejecuta supabase/setup.sql")
            healthy = False
        elif status == 200:
            print(table + ": ruta accesible anonimamente; revisar permisos y RLS antes de continuar")
            healthy = False
        else:
            print(table + f": comprobacion pendiente (HTTP {status}, {data.get('code', 'sin codigo')})")
            healthy = False
    print("No se han creado cuentas ni modificado datos.")
    if healthy:
        print("Conexion basica correcta. Falta probar login y guardado con una cuenta.")
    return healthy


if __name__ == "__main__":
    try:
        ok = check(mir_build.load_config())
    except (ValueError, URLError, TimeoutError, OSError) as error:
        print("No se ha podido completar la comprobacion:", type(error).__name__)
        ok = False
    sys.exit(0 if ok else 1)
