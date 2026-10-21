"""Run rollback-only database checks using an ephemeral personal token."""
import getpass
import sys

from publish_support import ROOT, PublishError, public_config, request_json


if __name__ == '__main__':
    try:
        config = public_config()
        ref = config['supabaseUrl'].split('//')[1].split('.')[0]
        token = getpass.getpass('Token personal para pruebas con rollback (entrada oculta): ').strip()
        sql = (ROOT / 'supabase/tests/automatic-import.sql').read_text(encoding='utf-8')
        try:
            result = request_json(f'https://api.supabase.com/v1/projects/{ref}/database/query',
                                  {'Authorization': 'Bearer ' + token}, {'query': sql})
        finally:
            del token
        if not isinstance(result, list) or not any(str(row.get('comprobacion', '')).startswith('OK:') for row in result):
            raise PublishError('Respuesta de verificación inesperada.')
        print('Supabase: permisos, importación, idempotencia, conflictos y atomicidad correctos. Pruebas revertidas.')
    except (PublishError, OSError, EOFError, KeyboardInterrupt):
        print('No se pudieron completar las pruebas de base de datos.', file=sys.stderr)
        sys.exit(1)
