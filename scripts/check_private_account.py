"""Validate the private account without writing files or modifying the exam history."""
import getpass
import json
import sys
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
import build as mir_build
from prepare_private_access import ACCOUNT


def request(config, path, method='GET', body=None, token=None):
    headers = {'apikey': config['supabasePublishableKey'], 'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    call = Request(config['supabaseUrl'] + path, method=method, headers=headers,
                   data=json.dumps(body).encode() if body is not None else None)
    try:
        with urlopen(call, timeout=15) as response:
            raw = response.read()
            return json.loads(raw) if raw else None
    except HTTPError as error:
        try:
            code = json.loads(error.read()).get('error_code') or str(error.code)
        except ValueError:
            code = str(error.code)
        raise RuntimeError('Solicitud rechazada: HTTP ' + str(error.code) + ' (' + code + ')') from None


def check():
    config = mir_build.load_config()
    if not config['supabaseUrl']:
        raise RuntimeError('Falta configurar Supabase.')
    settings = request(config, '/auth/v1/settings')
    if not settings.get('disable_signup'):
        raise RuntimeError('El registro sigue abierto en Supabase. Desactiva Allow new users to sign up antes de continuar.')
    print('Registro del servidor: cerrado.')
    print('Usuario:', ACCOUNT['ACCOUNT_USERNAME'])
    password = getpass.getpass('Contrasena de la cuenta (entrada oculta): ')
    session = request(config, '/auth/v1/token?grant_type=password', method='POST',
                      body={'email': ACCOUNT['ACCOUNT_EMAIL'], 'password': password})
    del password
    token = session['access_token']
    try:
        if session.get('user', {}).get('email', '').lower() != ACCOUNT['ACCOUNT_EMAIL']:
            raise RuntimeError('La identidad devuelta no es la cuenta privada.')
        if request(config, '/rest/v1/rpc/mir_has_access', method='POST', body={}, token=token) is not True:
            raise RuntimeError('La cuenta no tiene acceso a la plataforma.')
        profiles = request(config, '/rest/v1/profiles?select=id,display_name&limit=1', token=token)
        if len(profiles) != 1 or profiles[0]['id'] != session['user']['id']:
            raise RuntimeError('El perfil de la cuenta no esta disponible.')
        request(config, '/rest/v1/attempts?select=id&limit=0', token=token)
        print('Login, identidad privada, perfil y acceso al historial: OK.')
        print('No se han creado intentos ni cambiado respuestas.')
    finally:
        # Revoke only this diagnostic session; preserve the session open in the browser.
        try:
            request(config, '/auth/v1/logout?scope=local', method='POST', token=token)
        except (RuntimeError, URLError, TimeoutError):
            pass


if __name__ == '__main__':
    try:
        check()
    except (RuntimeError, URLError, OSError, TimeoutError, EOFError, KeyboardInterrupt) as error:
        print(str(error) if isinstance(error, RuntimeError) else 'Comprobacion interrumpida o conexion no disponible.')
        sys.exit(1)
