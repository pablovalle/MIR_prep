"""Private deployment configuration and HTTP. Never included in dist/. Standard library only."""
import base64
import ctypes
import json
import os
from pathlib import Path
import re
import subprocess
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, Request, build_opener

import build as mir_build

ROOT = Path(__file__).resolve().parent.parent
PRIVATE_CONFIG = ROOT / 'publish.local.json'


class PublishError(RuntimeError):
    pass


class ApiError(PublishError):
    def __init__(self, status, code):
        self.status, self.code = status, code
        super().__init__(f'Supabase rechazó la solicitud (HTTP {status}, {code}).')


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        # Never forward elevated credentials to a redirect target.
        return None


def request_json(url, headers, body):
    request = Request(url, data=json.dumps(body, ensure_ascii=False).encode('utf-8'),
                      headers={**headers, 'Content-Type': 'application/json'}, method='POST')
    try:
        with build_opener(NoRedirect()).open(request, timeout=90) as response:
            return json.loads(response.read())
    except HTTPError as error:
        # A server error might echo SQL, headers or payloads. Return only a sanitized code.
        try:
            data = json.loads(error.read())
            code = str(data.get('code', 'REJECTED'))
            if not re.fullmatch(r'[A-Za-z0-9_]{1,40}', code):
                code = 'REJECTED'
            if str(data.get('message', '')).startswith('EXAM_VERSION_CONFLICT:'):
                code = 'EXAM_VERSION_CONFLICT'
        except (ValueError, AttributeError):
            code = 'REJECTED'
        raise ApiError(error.code, code) from None
    except (URLError, TimeoutError, OSError):
        raise PublishError('No se pudo conectar con Supabase. No se publicará la web.') from None


def protect_secret(value, decrypt=False):
    if os.name != 'nt':
        raise PublishError('La configuración cifrada local requiere Windows. En otros sistemas usa SUPABASE_SECRET_KEY en el entorno.')
    from ctypes import wintypes

    class Blob(ctypes.Structure):
        _fields_ = [('size', wintypes.DWORD), ('data', ctypes.POINTER(ctypes.c_ubyte))]

    raw = base64.b64decode(value, validate=True) if decrypt else value.encode('utf-8')
    buffer = ctypes.create_string_buffer(raw)
    source = Blob(len(raw), ctypes.cast(buffer, ctypes.POINTER(ctypes.c_ubyte)))
    result = Blob()
    function = ctypes.windll.crypt32.CryptUnprotectData if decrypt else ctypes.windll.crypt32.CryptProtectData
    function.argtypes = [ctypes.POINTER(Blob), ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p,
                         ctypes.c_void_p, wintypes.DWORD, ctypes.POINTER(Blob)]
    function.restype = wintypes.BOOL
    if not function(ctypes.byref(source), None, None, None, None, 1, ctypes.byref(result)):
        raise PublishError('No se pudo acceder a la clave cifrada. Vuelve a configurar la publicación con este usuario de Windows.')
    try:
        output = ctypes.string_at(result.data, result.size)
        return output.decode('utf-8') if decrypt else base64.b64encode(output).decode('ascii')
    finally:
        ctypes.windll.kernel32.LocalFree.argtypes = [ctypes.c_void_p]
        ctypes.windll.kernel32.LocalFree(result.data)


def public_config():
    config = mir_build.load_config()
    if not config['supabaseUrl']:
        raise PublishError('Falta la URL y la clave pública en config.local.json o en el entorno.')
    return config


def secret_key():
    key = os.environ.get('SUPABASE_SECRET_KEY', '').strip()
    if not key and PRIVATE_CONFIG.exists():
        private = json.loads(PRIVATE_CONFIG.read_text(encoding='utf-8'))
        if private.get('supabaseUrl') != public_config()['supabaseUrl']:
            raise PublishError('La configuración privada corresponde a otro proyecto Supabase.')
        key = protect_secret(private['protectedSecretKey'], decrypt=True)
    if not key.startswith('sb_secret_') or len(key) < 25:
        raise PublishError('Falta una clave secreta válida. Ejecuta python scripts/configure_publish.py una vez.')
    return key


def save_secret(key):
    config = {'supabaseUrl': public_config()['supabaseUrl'], 'protectedSecretKey': protect_secret(key)}
    PRIVATE_CONFIG.write_text(json.dumps(config, indent=2) + '\n', encoding='utf-8')


def import_rpc(records, key, dry_run=False):
    result = request_json(public_config()['supabaseUrl'] + '/rest/v1/rpc/import_mir_exams',
                          {'apikey': key}, {'p_exams': records, 'p_dry_run': dry_run})
    if not isinstance(result, dict) or any(type(result.get(k)) is not int for k in ('imported', 'unchanged', 'pending')):
        raise PublishError('Respuesta de importación inesperada. No se publicará la web.')
    return result


def install_importer(token):
    if not token or token.startswith(('sb_secret_', 'sb_publishable_')):
        raise PublishError('La instalación inicial requiere un token personal de Supabase, no una API key del proyecto.')
    ref = public_config()['supabaseUrl'].split('//')[1].split('.')[0]
    sql = (ROOT / 'supabase' / 'automatic-import.sql').read_text(encoding='utf-8')
    request_json(f'https://api.supabase.com/v1/projects/{ref}/database/query',
                 {'Authorization': 'Bearer ' + token}, {'query': sql})


def command(args, *, input_text=None, capture=False, check=True):
    completed = subprocess.run(args, cwd=ROOT, input=input_text, text=True,
                               encoding='utf-8', errors='replace',
                               stdout=subprocess.PIPE if capture else None,
                               stderr=subprocess.PIPE if capture else None)
    if check and completed.returncode:
        # Do not print captured errors; credential helpers and external APIs may include secrets.
        raise PublishError('Falló el comando ' + args[0] + '. No se completó la publicación.')
    return completed


def github_repo():
    command(['gh', 'auth', 'status'], capture=True)
    repo = command(['gh', 'repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'], capture=True).stdout.strip()
    if not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', repo):
        raise PublishError('No se pudo identificar el repositorio GitHub.')
    return repo


def save_github_secret(repo, key):
    command(['gh', 'secret', 'set', 'SUPABASE_SECRET_KEY', '--repo', repo], input_text=key, capture=True)
