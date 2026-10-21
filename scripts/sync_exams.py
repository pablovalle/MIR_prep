"""Validate and import all MIRs with a server-only key; safe to rerun. No SQL editing."""
import argparse
import json
from pathlib import Path
import sys

import build as mir_build
from publish_support import ApiError, PublishError, ROOT, import_rpc, secret_key


def records():
    result, seen = [], set()
    for path in sorted((ROOT / 'MIR').glob('*/exam.json')):
        exam = mir_build.validate_exam(json.loads(path.read_text(encoding='utf-8')), path.parent)
        if exam['id'] in seen:
            raise PublishError('ID de examen duplicado: ' + exam['id'])
        seen.add(exam['id'])
        public = mir_build.public_exam(exam)
        for question in public['questions']:
            if question.get('image'):
                question['image'] = f"./MIR/{exam['id']}/{Path(question['image']).as_posix()}"
        result.append(mir_build.import_record(exam, public))
    if not result:
        raise PublishError('No hay exámenes para sincronizar.')
    return result


def sync(dry_run=False):
    exams = records()  # Validate every source before any remote write.
    key = secret_key()
    try:
        result = import_rpc(exams, key, dry_run=dry_run)
    except ApiError as error:
        if error.code == 'PGRST202':
            raise PublishError('Falta la instalación inicial del importador. Ejecuta python scripts/configure_publish.py una sola vez.') from None
        if error.code == 'EXAM_VERSION_CONFLICT':
            raise PublishError('Un examen ya importado tiene otro contenido. Crea una nueva versión con otro ID; no se ha cambiado ningún examen.') from None
        raise
    if not dry_run:
        verification = import_rpc(exams, key, dry_run=True)
        if verification['unchanged'] != len(exams) or verification['pending'] != 0:
            raise PublishError('No se ha confirmado la carga completa. No se publicará la web.')
    print(f"Supabase: {result['imported']} nuevos, {result['unchanged']} sin cambios, {result['pending']} pendientes.")
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Comprueba sin escribir en Supabase')
    args = parser.parse_args()
    try:
        sync(dry_run=args.check)
    except (PublishError, ValueError, OSError) as error:
        print(str(error) if isinstance(error, (PublishError, ValueError)) else 'No se pudo leer la configuración o los exámenes.', file=sys.stderr)
        sys.exit(1)
