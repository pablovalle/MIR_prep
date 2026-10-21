import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parent.parent
FOLDER = ROOT / 'MIR/MIR_IA_1'
spec = importlib.util.spec_from_file_location('mir_build_v2', ROOT / 'scripts/build.py')
build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)


class MirIaOneRevisionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.exam = json.loads((FOLDER / 'exam.json').read_text(encoding='utf-8'))
        cls.original = json.loads((ROOT / 'MIR/archive/MIR_IA_1_v1/exam.json').read_text(encoding='utf-8'))

    def test_new_version_has_requested_description_and_200_evaluable_questions(self):
        build.validate_exam(self.exam, FOLDER)
        self.assertEqual(self.exam['id'], 'mir-ia-1-v2')
        self.assertEqual(self.exam['title'], 'MIR_IA_1')
        self.assertEqual(self.exam['description'], 'MIR generado por Rosa con IA')
        self.assertEqual(len(self.exam['questions']), 200)
        self.assertFalse(any(q.get('voided') for q in self.exam['questions']))
        self.assertEqual(self.exam['editorialNotes']['replacedQuestions'], [148, 181])

    def test_only_the_two_previously_voided_questions_change(self):
        changes = [index for index, (old, new) in enumerate(zip(self.original['questions'], self.exam['questions']), 1) if old != new]
        self.assertEqual(changes, [148, 181])
        for index in changes:
            old, new = self.original['questions'][index - 1], self.exam['questions'][index - 1]
            self.assertTrue(old['voided'])
            self.assertNotEqual(old['statement'], new['statement'])
            self.assertNotEqual(old['options'], new['options'])
            self.assertEqual(old['id'], new['id'])
            self.assertEqual(new['correctOptionId'], 'c')
            self.assertIn('https://', new['explanation'])

    def test_archive_preserves_original_version_and_is_not_discovered_for_new_imports(self):
        self.assertEqual(self.original['id'], 'mir-ia-1-v1')
        self.assertEqual([q['id'] for q in self.original['questions'] if q.get('voided')], ['q148', 'q181'])
        discovered = [json.loads(path.read_text(encoding='utf-8'))['id'] for path in (ROOT / 'MIR').glob('*/exam.json')]
        self.assertIn('mir-ia-1-v2', discovered)
        self.assertNotIn('mir-ia-1-v1', discovered)


if __name__ == '__main__':
    unittest.main()
