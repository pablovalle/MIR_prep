"""One-time setup. Prompts hide credentials; the personal token is never persisted."""
import getpass
import sys
import time

from publish_support import (ApiError, PublishError, github_repo, import_rpc,
                             install_importer, save_github_secret, save_secret)


def configure():
    repo = github_repo()
    key = getpass.getpass('Clave secreta del proyecto Supabase (entrada oculta): ').strip()
    if not key.startswith('sb_secret_') or len(key) < 25:
        raise PublishError('Se necesita una clave sb_secret_ válida.')
    try:
        import_rpc([], key, dry_run=True)
    except ApiError as error:
        if error.code != 'PGRST202':
            raise
        print('Primera instalación: se necesita un token personal de Supabase con permiso Database/Write para este proyecto.')
        print('Crear en https://supabase.com/dashboard/account/tokens . Solo se usa ahora y no se guarda.')
        token = getpass.getpass('Token personal de Supabase (entrada oculta): ').strip()
        try:
            install_importer(token)
        finally:
            del token
        for attempt in range(8):
            try:
                import_rpc([], key, dry_run=True)
                break
            except ApiError as retry_error:
                if retry_error.code != 'PGRST202' or attempt == 7:
                    raise
                time.sleep(2)
    save_secret(key)
    save_github_secret(repo, key)
    del key
    print('Configurado: clave local cifrada con Windows y secreto protegido de GitHub Actions.')
    print('Para los próximos MIR: python scripts/publish.py')


if __name__ == '__main__':
    try:
        configure()
    except (PublishError, OSError, EOFError, KeyboardInterrupt):
        print('No se completó la configuración. Revisa la conexión, las credenciales y gh auth status; las claves no se muestran.', file=sys.stderr)
        sys.exit(1)
