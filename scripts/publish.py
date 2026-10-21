"""One command: validate, test, import MIRs, commit/push and wait for GitHub Pages."""
import argparse
import json
from pathlib import Path
import re
import shutil
import sys
import time

from publish_support import (PublishError, ROOT, command, github_repo,
                             save_github_secret, secret_key)
from sync_exams import sync


def git(*args, **kwargs):
    return command(['git', *args], **kwargs)


def node_binary():
    executable = shutil.which('node')
    if executable:
        return executable
    # Codex on this Windows installation includes a Node runtime with Playwright.
    bundled = Path(sys.executable).parent / 'Lib/site-packages/playwright/driver/node.exe'
    if bundled.is_file():
        return str(bundled)
    raise PublishError('Las comprobaciones requieren Node.js 22 o posterior. Instálalo una vez antes de publicar.')


def check_staged_files():
    paths = git('diff', '--cached', '--name-only', '-z', '--diff-filter=ACM', capture=True).stdout.split('\0')
    for path in filter(None, paths):
        if Path(path).name.lower() in ('config.local.json', 'publish.local.json', '.env'):
            raise PublishError('Se ha detectado configuración privada preparada para Git. Retírala del índice antes de publicar.')
        # Inspect the exact staged content, never print its contents or matching secrets.
        content = git('show', ':' + path, capture=True).stdout
        if re.search(r'\bsb_secret_[A-Za-z0-9_-]{20,}|\bsbp_[A-Za-z0-9_-]{20,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----', content):
            raise PublishError('Se ha detectado una credencial privada en un archivo preparado para Git. No se publicará.')


def run_ids(repo, sha):
    raw = command(['gh', 'run', 'list', '--repo', repo, '--workflow', 'pages.yml',
                   '--branch', 'main', '--commit', sha, '--limit', '10',
                   '--json', 'databaseId,status,conclusion,url'], capture=True).stdout
    return json.loads(raw)


def wait_for_pages(repo, sha, previous_ids):
    deadline = time.monotonic() + 900
    run = None
    while time.monotonic() < deadline:
        candidates = [r for r in run_ids(repo, sha) if r['databaseId'] not in previous_ids]
        if candidates:
            run = max(candidates, key=lambda r: r['databaseId'])
            break
        time.sleep(5)
    if not run:
        raise PublishError('El código está subido, pero no se ha podido identificar el workflow de Pages. Consulta GitHub Actions.')
    print('Publicación en curso: ' + run['url'], flush=True)
    command(['gh', 'run', 'watch', str(run['databaseId']), '--repo', repo, '--exit-status', '--interval', '10'])
    pages = json.loads(command(['gh', 'api', 'repos/' + repo + '/pages'], capture=True).stdout)
    print('Publicado: ' + pages.get('html_url', 'https://github.com/' + repo + '/actions'))


def publish(message, no_wait=False):
    # All local validation precedes database writes, commits and publication.
    if git('branch', '--show-current', capture=True).stdout.strip() != 'main':
        raise PublishError('Publica desde la rama main. No se cambia de rama automáticamente.')
    repo = github_repo()
    node = node_binary()
    command([sys.executable, 'scripts/build.py', '--require-backend'])
    command([sys.executable, '-m', 'unittest', 'discover', '-s', 'tests'])
    tests = [str(path.relative_to(ROOT)) for path in sorted((ROOT / 'tests').glob('*.test.mjs'))]
    command([node, '--test', *tests])
    git('diff', '--check')
    git('fetch', 'origin', 'main', capture=True)
    if git('merge-base', '--is-ancestor', 'origin/main', 'HEAD', capture=True, check=False).returncode:
        raise PublishError('Hay cambios remotos por integrar. Actualiza main antes de publicar; no se sobrescribe GitHub.')
    key = secret_key()
    sync(dry_run=True)
    # Stage the current repository changes; ignored config/credentials remain excluded.
    git('add', '--all', '--', '.')
    check_staged_files()
    git('diff', '--cached', '--check')
    sync()
    save_github_secret(repo, key)
    del key
    has_changes = git('diff', '--cached', '--quiet', check=False, capture=True).returncode
    if has_changes == 1:
        git('commit', '-m', message)
    elif has_changes != 0:
        raise PublishError('No se pudo comprobar el índice de Git.')
    sha = git('rev-parse', 'HEAD', capture=True).stdout.strip()
    old_runs = {r['databaseId'] for r in run_ids(repo, sha)}
    remote_sha = git('rev-parse', 'origin/main', capture=True).stdout.strip()
    git('-c', 'credential.helper=', '-c', 'credential.helper=!gh auth git-credential', 'push', 'origin', 'main')
    if remote_sha == sha:
        command(['gh', 'workflow', 'run', 'pages.yml', '--repo', repo, '--ref', 'main'])
    if no_wait:
        print('Supabase sincronizado y publicación solicitada: https://github.com/' + repo + '/actions')
    else:
        wait_for_pages(repo, sha, old_runs)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--message', default='Publicar nuevos simulacros MIR', help='Mensaje del commit automático')
    parser.add_argument('--no-wait', action='store_true', help='Salir después del push, sin esperar al despliegue')
    args = parser.parse_args()
    try:
        publish(args.message, no_wait=args.no_wait)
    except (PublishError, ValueError, OSError, KeyboardInterrupt) as error:
        print(str(error) if isinstance(error, PublishError) else 'No se completó la publicación. Revisa la configuración y las comprobaciones anteriores.', file=sys.stderr)
        sys.exit(1)
