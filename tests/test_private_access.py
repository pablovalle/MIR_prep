import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('prepare_private_access', ROOT / 'scripts' / 'prepare_private_access.py')
prepare = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare)


class PrivateAccessTests(unittest.TestCase):
    def setUp(self):
        self.schema = (ROOT / 'supabase' / 'schema.sql').read_text(encoding='utf-8')

    def test_every_privileged_rpc_checks_access_before_reading_or_writing(self):
        sql = prepare.private_access_sql(self.schema)
        self.assertEqual(sql.count("raise exception 'ACCESS_DENIED'"), 3)
        for name in ('start_exam', 'save_attempt', 'submit_attempt'):
            body = sql.split(f'create or replace function public.{name}(', 1)[1].split('$$;', 1)[0]
            self.assertLess(body.index("raise exception 'ACCESS_DENIED'"), body.index('select '))

    def test_restrictive_policies_keep_existing_owner_checks_and_do_not_delete_data(self):
        sql = prepare.private_access_sql(self.schema)
        self.assertEqual(sql.count('as restrictive'), 2)
        self.assertNotIn('delete from', sql.lower())
        self.assertNotIn('drop table', sql.lower())
        self.assertIn('from auth.users u', sql)
        self.assertIn('u.id = auth.uid()', sql)
        self.assertNotIn('user_metadata', sql)
        self.assertLess(sql.index('$mir_account_guard$'), sql.index('create or replace function'))

    def test_fails_closed_if_schema_changes_unexpectedly(self):
        with self.assertRaises(ValueError):
            prepare.private_access_sql(self.schema.replace("raise exception 'AUTH_REQUIRED'", "raise exception 'OTHER'"))


if __name__ == '__main__':
    unittest.main()
