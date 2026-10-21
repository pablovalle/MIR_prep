import importlib.util
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
spec = importlib.util.spec_from_file_location("prepare_supabase", ROOT / "scripts" / "prepare_supabase.py")
prepare = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare)


class SetupTests(unittest.TestCase):
    def test_atomic_bundle_preserves_function_bodies(self):
        schema = (ROOT / "supabase" / "schema.sql").read_text(encoding="utf-8")
        sample_import = "begin;\ndo $import$\nbegin\n  perform 1;\nend;\n$import$;\ncommit;\n"
        bundle = prepare.setup_sql(schema, sample_import)
        self.assertEqual(bundle.count("\nbegin;\n"), 1)
        self.assertEqual(bundle.count("\ncommit;\n"), 1)
        self.assertIn("language plpgsql security definer", bundle)
        self.assertIn("perform 1;", bundle)
        self.assertLess(bundle.index("$mir_install_guard$"), bundle.index("create table private.exams"))
        self.assertIn("to_regclass('public.profiles')", bundle)
        self.assertIn("to_regnamespace('private')", bundle)

    def test_rejects_sql_without_complete_transaction(self):
        with self.assertRaises(ValueError):
            prepare.unwrap_transaction("create table example (id int);")


if __name__ == "__main__":
    unittest.main()
