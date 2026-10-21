"""Build the public Pages artifact and, optionally, the private SQL import. No dependencies."""
import argparse
import copy
import hashlib
import json
import os
from pathlib import Path
import re
import shutil

ROOT = Path(__file__).resolve().parent.parent
SAFE_ID = re.compile(r"^[a-zA-Z0-9_-]{1,80}$")


def validate_exam(exam, folder):
    for field in ("id", "title", "description", "category"):
        if not isinstance(exam.get(field), str) or not exam[field].strip():
            raise ValueError(f"{folder}: falta {field}")
    if not SAFE_ID.fullmatch(exam["id"]):
        raise ValueError(f"{folder}: id inválido")
    if type(exam.get("isDemo")) is not bool:
        raise ValueError(f"{folder}: isDemo debe ser booleano")
    duration = exam.get("durationMinutes")
    if type(duration) is not int or not 1 <= duration <= 1440:
        raise ValueError(f"{folder}: duración inválida")
    scoring = exam.get("scoring", {})
    if any(type(scoring.get(k)) is not int for k in ("correct", "incorrect", "blank")):
        raise ValueError(f"{folder}: puntuación inválida")
    if not 1 <= scoring["correct"] <= 1000 or not -1000 <= scoring["incorrect"] <= 0 or scoring["blank"] != 0:
        raise ValueError(f"{folder}: usa acierto positivo, error no positivo y blanco 0")
    questions = exam.get("questions")
    if not isinstance(questions, list) or not 1 <= len(questions) <= 500:
        raise ValueError(f"{folder}: se necesitan entre 1 y 500 preguntas")
    ids = set()
    for q in questions:
        qid = q.get("id", "")
        if not SAFE_ID.fullmatch(qid) or qid in ids:
            raise ValueError(f"{folder}: id de pregunta inválido o duplicado: {qid}")
        ids.add(qid)
        for field in ("statement", "specialty", "explanation"):
            if not isinstance(q.get(field), str) or not q[field].strip():
                raise ValueError(f"{folder}/{qid}: falta {field}")
        options = q.get("options", [])
        if not isinstance(options, list) or not 2 <= len(options) <= 6:
            raise ValueError(f"{folder}/{qid}: se necesitan 2–6 opciones")
        option_ids = [o.get("id", "") for o in options]
        if len(set(option_ids)) != len(option_ids) or any(not SAFE_ID.fullmatch(i) for i in option_ids):
            raise ValueError(f"{folder}/{qid}: identificadores de opción inválidos")
        if any(not isinstance(o.get("text"), str) or not o["text"].strip() for o in options):
            raise ValueError(f"{folder}/{qid}: opción vacía")
        if q.get("correctOptionId") not in option_ids:
            raise ValueError(f"{folder}/{qid}: la respuesta correcta no existe")
        if "voided" in q and type(q["voided"]) is not bool:
            raise ValueError(f"{folder}/{qid}: voided debe ser booleano")
        if q.get("image"):
            image = Path(q["image"])
            source = (folder / image).resolve()
            if image.is_absolute() or not source.is_relative_to(folder.resolve()):
                raise ValueError(f"{folder}/{qid}: la imagen debe estar dentro del examen")
            if source.suffix.lower() not in (".png", ".jpg", ".jpeg", ".webp", ".gif") or not source.is_file():
                raise ValueError(f"{folder}/{qid}: imagen no válida")
            if not q.get("imageAlt"):
                raise ValueError(f"{folder}/{qid}: falta imageAlt")
    if all(q.get("voided") for q in questions):
        raise ValueError(f"{folder}: debe haber alguna pregunta evaluable")
    return exam


def public_exam(exam):
    """Whitelist fields: unknown future private fields must never reach Pages."""
    public = {k: copy.deepcopy(exam[k]) for k in (
        "id", "title", "subtitle", "description", "category", "isDemo", "durationMinutes", "scoring"
    ) if k in exam}
    public["questions"] = [{k: copy.deepcopy(q[k]) for k in (
        "id", "specialty", "statement", "options", "image", "imageAlt", "voided"
    ) if k in q} for q in exam["questions"]]
    for q in public["questions"]:
        q["options"] = [{"id": option["id"], "text": option["text"]} for option in q["options"]]
    return public


def sql_import(exam, public):
    payload = json.dumps({"exam": public, "solutions": {
        q["id"]: {"correctOptionId": q["correctOptionId"], "explanation": q["explanation"]}
        for q in exam["questions"]
    }}, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    fingerprint = hashlib.sha256(payload.encode()).hexdigest()
    # Standard SQL string escaping (standard_conforming_strings is enabled explicitly).
    literal = payload.replace("'", "''")
    exam_id = exam["id"]  # validated against SAFE_ID
    delimiter = "$mir_import$"
    while delimiter in payload:
        delimiter = delimiter[:-1] + "x$"
    return f"""-- {exam_id} (inmutable)
do {delimiter}
begin
  if exists (select 1 from private.exams where id = '{exam_id}' and fingerprint <> '{fingerprint}') then
    raise exception 'El examen {exam_id} ya existe con otro contenido. Usa un ID de versión nuevo.';
  end if;
  insert into private.exams (id, payload, fingerprint)
  values ('{exam_id}', '{literal}'::jsonb, '{fingerprint}')
  on conflict (id) do nothing;
end;
{delimiter};
"""


def load_config():
    config_file = ROOT / "config.local.json"
    config = json.loads(config_file.read_text(encoding="utf-8")) if config_file.exists() else {}
    url = os.environ.get("SUPABASE_URL", config.get("supabaseUrl", "")).rstrip("/")
    key = os.environ.get("SUPABASE_PUBLISHABLE_KEY", config.get("supabasePublishableKey", ""))
    if bool(url) != bool(key):
        raise ValueError("Configura tanto SUPABASE_URL como SUPABASE_PUBLISHABLE_KEY")
    if url and not re.fullmatch(r"https://[a-z0-9-]+\.supabase\.co", url):
        raise ValueError("Usa la URL HTTPS de tu proyecto Supabase (*.supabase.co)")
    if key.startswith(("sb_secret_", "service_role")):
        raise ValueError("Nunca publiques una clave secreta/service_role")
    if key.count(".") == 2:
        import base64
        try:
            claims = json.loads(base64.urlsafe_b64decode(key.split(".")[1] + "=="))
        except (ValueError, UnicodeDecodeError):
            raise ValueError("Clave pública JWT inválida") from None
        if claims.get("role") != "anon":
            raise ValueError("Solo se admite una clave anon o sb_publishable_, nunca service_role")
    elif key and not key.startswith("sb_publishable_"):
        raise ValueError("Usa una clave sb_publishable_ o anon válida")
    # Private installation: builds cannot reopen registration through environment variables.
    return {"supabaseUrl": url, "supabasePublishableKey": key, "allowSignup": False}


def build(include_sql=False, require_backend=False):
    exams = []
    seen = set()
    for path in sorted((ROOT / "MIR").glob("*/exam.json")):
        exam = validate_exam(json.loads(path.read_text(encoding="utf-8")), path.parent)
        if exam["id"] in seen:
            raise ValueError(f"ID de examen duplicado: {exam['id']}")
        seen.add(exam["id"])
        exams.append((path.parent, exam))
    config = load_config()
    if require_backend and not config["supabaseUrl"]:
        raise ValueError("Publicación detenida: configura SUPABASE_URL y SUPABASE_PUBLISHABLE_KEY para mantener el acceso privado")
    # Fixed, checked build directory. Never delete an arbitrary caller-supplied path.
    output = ROOT / "dist"
    if output.is_symlink() or output.resolve() != ROOT.resolve() / "dist":
        raise ValueError("Directorio dist no seguro")
    if output.exists():
        shutil.rmtree(output)
    output.mkdir()
    shutil.copy2(ROOT / "index.html", output / "index.html")
    for directory in ("src", "assets"):
        shutil.copytree(ROOT / directory, output / directory)
    (output / ".nojekyll").touch()
    (output / "config.json").write_text(json.dumps(config), encoding="utf-8")
    catalog = []
    imports = ["-- Privado: ejecutar en Supabase SQL Editor. No publicar este archivo.\nbegin;\nset standard_conforming_strings = on;\n"]
    for folder, exam in exams:
        public = public_exam(exam)
        target = output / "MIR" / exam["id"]
        target.mkdir(parents=True)
        for q in public["questions"]:
            if q.get("image"):
                destination = target / q["image"]
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(folder / q["image"], destination)
                q["image"] = f"./MIR/{exam['id']}/{Path(q['image']).as_posix()}"
        (target / "exam.json").write_text(json.dumps(public, ensure_ascii=False), encoding="utf-8")
        if exam["isDemo"]:
            solutions = {q["id"]: {"correctOptionId": q["correctOptionId"], "explanation": q["explanation"]} for q in exam["questions"]}
            (target / "demo-solutions.json").write_text(json.dumps(solutions, ensure_ascii=False), encoding="utf-8")
        catalog.append({**{k: v for k, v in public.items() if k != "questions"},
                        "questionCount": sum(not q.get("voided", False) for q in exam["questions"]),
                        "path": f"./MIR/{exam['id']}/exam.json"})
        imports.append(sql_import(exam, public))
    (output / "MIR").mkdir(exist_ok=True)
    (output / "MIR" / "catalog.json").write_text(json.dumps(catalog, ensure_ascii=False), encoding="utf-8")
    if include_sql:
        (ROOT / "supabase" / "import.sql").write_text("\n".join(imports) + "\ncommit;\n", encoding="utf-8")
    print(f"MIR_Prep: {len(exams)} examen(es) validados. Web en dist/. Cuentas: {'Supabase' if config['supabaseUrl'] else 'solo demo'}.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sql", action="store_true", help="Genera también supabase/import.sql (privado)")
    parser.add_argument("--require-backend", action="store_true", help="Impide publicar una demo sin Supabase configurado")
    args = parser.parse_args()
    build(args.sql, require_backend=args.require_backend)
