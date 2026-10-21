import base64
import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("mir_build", ROOT / "scripts" / "build.py")
build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)


class BuildTests(unittest.TestCase):
    def setUp(self):
        self.folder = ROOT / "MIR" / "demo"
        self.exam = json.loads((self.folder / "exam.json").read_text(encoding="utf-8"))

    def test_sample_is_valid(self):
        self.assertEqual(build.validate_exam(self.exam, self.folder)["id"], "demo-v1")

    def test_public_artifact_never_copies_solutions_or_unknown_fields(self):
        self.exam["private_note"] = "private"
        self.exam["questions"][0]["private_feedback"] = "secret"
        self.exam["questions"][0]["options"][0]["private_feedback"] = "secret"
        public = json.dumps(build.public_exam(self.exam))
        for field in ("correctOptionId", "explanation", "private_note", "private_feedback"):
            self.assertNotIn(field, public)

    def test_sanitization_does_not_mutate_the_original(self):
        public = build.public_exam(self.exam)
        public["questions"][0]["options"][0]["text"] = "changed"
        self.assertNotEqual(self.exam["questions"][0]["options"][0]["text"], "changed")

    def test_reject_duplicate_question(self):
        self.exam["questions"].append(copy.deepcopy(self.exam["questions"][0]))
        with self.assertRaises(ValueError):
            build.validate_exam(self.exam, self.folder)

    def test_reject_missing_correct_option(self):
        self.exam["questions"][0]["correctOptionId"] = "not-an-option"
        with self.assertRaises(ValueError):
            build.validate_exam(self.exam, self.folder)

    def test_reject_image_traversal(self):
        self.exam["questions"][0]["image"] = "../../usuarios/private.png"
        with self.assertRaises(ValueError):
            build.validate_exam(self.exam, self.folder)

    def test_reject_invalid_scoring(self):
        for scoring in ({"correct": 0, "incorrect": -1, "blank": 0}, {"correct": 3, "incorrect": 1, "blank": 0}, {"correct": 3, "incorrect": -1, "blank": 2}):
            self.exam["scoring"] = scoring
            with self.assertRaises(ValueError):
                build.validate_exam(self.exam, self.folder)

    def test_reject_all_voided(self):
        for question in self.exam["questions"]:
            question["voided"] = True
        with self.assertRaises(ValueError):
            build.validate_exam(self.exam, self.folder)

    def test_sql_escapes_quotes_and_avoids_dollar_delimiter_collision(self):
        self.exam["questions"][0]["explanation"] = "L'examen $mir_import$ et $mir_importx$"
        sql = build.sql_import(self.exam, build.public_exam(self.exam))
        self.assertIn("L''examen", sql)
        self.assertIn("do $mir_importxx$", sql)
        self.assertIn("fingerprint <>", sql)
        self.assertIn("on conflict (id) do nothing", sql)

    def test_sql_hash_changes_when_solutions_change(self):
        before = build.sql_import(self.exam, build.public_exam(self.exam))
        self.exam["questions"][0]["correctOptionId"] = "b"
        self.assertNotEqual(before, build.sql_import(self.exam, build.public_exam(self.exam)))

    def test_private_non_demo_content_is_not_deployed(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "MIR" / "real").mkdir(parents=True)
            for directory in ("src", "assets", "supabase"):
                (root / directory).mkdir()
            (root / "index.html").write_text("test", encoding="utf-8")
            self.exam.update({"id": "real-v1", "isDemo": False})
            (root / "MIR" / "real" / "exam.json").write_text(json.dumps(self.exam), encoding="utf-8")
            (root / "usuarios").mkdir()
            (root / "usuarios" / "private.json").write_text('{"personal": true}', encoding="utf-8")
            with patch.object(build, "ROOT", root), patch.dict("os.environ", {}, clear=True):
                build.build(True)
            artifact = root / "dist"
            public = json.loads((artifact / "MIR" / "real-v1" / "exam.json").read_text(encoding="utf-8"))
            self.assertNotIn("correctOptionId", json.dumps(public))
            self.assertFalse((artifact / "MIR" / "real-v1" / "demo-solutions.json").exists())
            self.assertFalse((artifact / "usuarios").exists())
            self.assertFalse((artifact / "supabase").exists())
            self.assertTrue((root / "supabase" / "import.sql").exists())
            # A removed exam must not survive the next build as a stale public file.
            (root / "MIR" / "real" / "exam.json").unlink()
            with patch.object(build, "ROOT", root), patch.dict("os.environ", {}, clear=True):
                build.build()
            self.assertFalse((artifact / "MIR" / "real-v1").exists())

    def test_reject_service_role_key(self):
        claims = base64.urlsafe_b64encode(b'{"role":"service_role"}').decode().rstrip('=')
        with patch.dict("os.environ", {"SUPABASE_URL": "https://test.supabase.co", "SUPABASE_PUBLISHABLE_KEY": f"e30.{claims}.signature"}):
            with self.assertRaises(ValueError):
                build.load_config()

    def test_environment_cannot_reopen_private_registration(self):
        with patch.dict("os.environ", {"ALLOW_SIGNUP": "true"}):
            self.assertIs(build.load_config()["allowSignup"], False)

    def test_production_build_refuses_missing_backend_before_creating_artifact(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            with patch.object(build, "ROOT", root), patch.dict("os.environ", {}, clear=True):
                with self.assertRaisesRegex(ValueError, "Publicación detenida"):
                    build.build(require_backend=True)
            self.assertFalse((root / "dist").exists())


if __name__ == "__main__":
    unittest.main()
