import io
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'scripts'))
import publish_support as support
import sync_exams
import publish


class AutomaticPublishTests(unittest.TestCase):
    def test_rest_secret_is_only_in_api_header_and_redirects_are_disabled(self):
        with patch.object(support, 'build_opener') as opener:
            opener.return_value.open.return_value.__enter__.return_value.read.return_value = b'{"imported":0,"unchanged":0,"pending":0}'
            with patch.object(support, 'public_config', return_value={'supabaseUrl': 'https://example.supabase.co'}):
                support.import_rpc([], 'private-value', dry_run=True)
            request = opener.return_value.open.call_args.args[0]
            self.assertEqual(request.get_header('Apikey'), 'private-value')
            self.assertIsNone(request.get_header('Authorization'))
            self.assertEqual(json.loads(request.data), {'p_exams': [], 'p_dry_run': True})
            self.assertIsNone(support.NoRedirect().redirect_request(None, None, 302, '', {}, 'https://elsewhere.test'))

    def test_errors_never_echo_server_messages_or_credentials(self):
        body = json.dumps({'code': 'P0001', 'message': 'secret-value must not escape'}).encode()
        error = HTTPError('https://example.supabase.co', 400, 'Error', {}, io.BytesIO(body))
        with patch.object(support, 'build_opener') as opener:
            opener.return_value.open.side_effect = error
            with self.assertRaises(support.ApiError) as caught:
                support.request_json('https://example.supabase.co', {'apikey': 'secret-value'}, {})
        self.assertNotIn('secret-value', str(caught.exception))
        self.assertEqual(caught.exception.code, 'P0001')

    def test_source_fingerprints_match_built_import_including_images(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            shutil.copytree(ROOT / 'MIR', root / 'MIR')
            (root / 'index.html').write_text('test', encoding='utf-8')
            (root / 'src').mkdir()
            (root / 'assets').mkdir()
            demo = root / 'MIR/demo/exam.json'
            exam = json.loads(demo.read_text(encoding='utf-8'))
            exam['questions'][0].update(image='fixture.png', imageAlt='Prueba')
            demo.write_text(json.dumps(exam), encoding='utf-8')
            (demo.parent / 'fixture.png').write_bytes(b'fixture')
            config = {'supabaseUrl': '', 'supabasePublishableKey': '', 'allowSignup': False}
            with patch.object(sync_exams, 'ROOT', root), patch.object(sync_exams.mir_build, 'ROOT', root), patch.object(sync_exams.mir_build, 'load_config', return_value=config):
                sync_exams.mir_build.build()
                source_records = sync_exams.records()
            self.assertGreaterEqual(len(source_records), 2)
            for record in source_records:
                public = json.loads((root / 'dist/MIR' / record['id'] / 'exam.json').read_text(encoding='utf-8'))
                self.assertEqual(record['payload']['exam'], public)
                self.assertIn(record['fingerprint'], sync_exams.mir_build.sql_import(
                    {'id': record['id'], 'questions': [dict(q, **record['payload']['solutions'][q['id']]) for q in public['questions']]}, public))

    def test_invalid_source_cannot_reach_supabase(self):
        with patch.object(sync_exams, 'records', side_effect=ValueError('Invalid')), patch.object(sync_exams, 'import_rpc') as rpc:
            with self.assertRaises(ValueError):
                sync_exams.sync()
            rpc.assert_not_called()

    def test_successful_import_requires_readback_confirmation(self):
        with patch.object(sync_exams, 'records', return_value=[{}]), patch.object(sync_exams, 'secret_key', return_value='key'), patch.object(sync_exams, 'import_rpc') as rpc:
            rpc.side_effect = [{'imported': 1, 'unchanged': 0, 'pending': 0}, {'imported': 0, 'unchanged': 0, 'pending': 1}]
            with self.assertRaisesRegex(support.PublishError, 'confirmado'):
                sync_exams.sync()

    def test_staged_secret_blocks_commit_without_printing_the_value(self):
        credential = 'sb_' + 'secret_' + 'x' * 30
        def git(*args, **kwargs):
            class Result:
                stdout = 'src/leaked.js\0' if args[0] == 'diff' else credential
            return Result()
        with patch.object(publish, 'git', side_effect=git):
            with self.assertRaises(support.PublishError) as caught:
                publish.check_staged_files()
        self.assertNotIn(credential, str(caught.exception))

    @unittest.skipUnless(os.name == 'nt', 'Windows DPAPI')
    def test_local_secret_is_encrypted_and_round_trips_for_current_windows_user(self):
        value = 'sb_' + 'secret_' + 'test-value-for-encryption'
        encrypted = support.protect_secret(value)
        self.assertNotIn(value, encrypted)
        self.assertEqual(support.protect_secret(encrypted, decrypt=True), value)

    def test_deployment_key_cannot_be_used_as_management_token(self):
        with self.assertRaisesRegex(support.PublishError, 'token personal'):
            support.install_importer('sb_' + 'secret_' + 'not-a-personal-token')


if __name__ == '__main__':
    unittest.main()
