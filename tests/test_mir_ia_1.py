"""Integrity checks for the reconstructed source and supplied answer sheet."""
import importlib.util
import json
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parent.parent
FOLDER = ROOT / "MIR" / "archive" / "MIR_IA_1_v1"
spec = importlib.util.spec_from_file_location("mir_build_exam", ROOT / "scripts" / "build.py")
build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)

# Independent transcription of the answer sheet in the supplied message.
SUPPLIED = """
51B 52C 53A 54D 55B 56C 57A 58D 59B 60C
61A 62D 63B 64C 65A 66D 67B 68C 69A 70D
71B 72C 73A 74D 75B 76C 77A 78D 79B 80C
81A 82D 83B 84C 85A 86D 87B 88C 89A 90D
91B 92C 93A 94D 95B 96C 97A 98D 99B 100C
101B 102D 103A 104C 105B 106D 107A 108C 109B 110D
111A 112C 113B 114D 115A 116C 117B 118D 119A 120C
121B 122D 123A 124C 125B 126D 127A 128C 129B 130D
131A 132C 133B 134D 135A 136C 137B 138D 139A 140C
141B 142D 143A 144C 145B 146D 147A 148C 149B 150D
151C 152A 153D 154B 155C 156A 157D 158B 159C 160A
161D 162B 163C 164A 165D 166B 167C 168A 169D 170B
171C 172A 173D 174B 175C 176A 177D 178B 179C 180A
181C 182B 183D 184A 185C 186B 187D 188A 189C 190B
191D 192A 193C 194B 195D 196A 197C 198B 199D 200A
"""


class MirIaOneTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.exam = json.loads((FOLDER / "exam.json").read_text(encoding="utf-8"))

    def test_complete_ordered_exam_and_four_options(self):
        build.validate_exam(self.exam, FOLDER)
        self.assertEqual(self.exam["title"], "MIR_IA_1")
        self.assertFalse(self.exam["isDemo"])
        self.assertEqual([q["id"] for q in self.exam["questions"]], [f"q{i}" for i in range(1, 201)])
        for q in self.exam["questions"]:
            self.assertEqual([o["id"] for o in q["options"]], list("abcd"))
            self.assertNotRegex(q["statement"], r"Rosa Suegri|21/10/26|@mondragon|logo_berria")

    def test_supplied_key_51_to_200_is_preserved_including_intended_void_keys(self):
        expected = {f"q{number}": letter.lower() for number, letter in re.findall(r"(\d+)([ABCD])", SUPPLIED)}
        self.assertEqual(len(expected), 150)
        actual = {q["id"]: q["correctOptionId"] for q in self.exam["questions"][50:]}
        self.assertEqual(actual, expected)

    def test_first_block_is_explicitly_identified_as_a_proposed_key(self):
        review = (FOLDER / "REVIEW.md").read_text(encoding="utf-8")
        pairs = re.findall(r"\b(\d+)([ABCD])\b", review.split("```")[1])
        expected = {f"q{number}": letter.lower() for number, letter in pairs}
        self.assertEqual(len(expected), 50)
        self.assertEqual({q["id"]: q["correctOptionId"] for q in self.exam["questions"][:50]}, expected)
        self.assertIn("no estaba", self.exam["editorialNotes"]["answers1to50"])

    def test_only_the_two_documented_questions_are_voided(self):
        voided = [q["id"] for q in self.exam["questions"] if q.get("voided")]
        self.assertEqual(voided, ["q148", "q181"])
        for q in self.exam["questions"]:
            if q.get("voided"):
                self.assertIn("ANULADA", q["explanation"])
                self.assertIn("https://", q["explanation"])

    def test_fragments_that_crossed_messages_have_their_missing_options(self):
        expected_last_options = {
            12: "Pancreatitis.",
            79: "Neuropatía periférica.",
            125: "Demencia frontotemporal.",
            139: "Antifúngicos orales obligatorios.",
            163: "Déficit de vitamina B12 en todos los pacientes.",
            175: "Dar por terminada toda asistencia sanitaria.",
            187: "Evaluar y tratar urgentemente una posible neumonía grave con sepsis.",
            198: "Densitometría ósea.",
        }
        for number, text in expected_last_options.items():
            self.assertEqual(self.exam["questions"][number - 1]["options"][3]["text"], text)

    def test_public_exam_removes_key_explanations_and_editorial_fields(self):
        public = build.public_exam(self.exam)
        self.assertEqual(len(public["questions"]), 200)
        self.assertEqual(sum(not q.get("voided") for q in public["questions"]), 198)
        serialized = json.dumps(public, ensure_ascii=False)
        for private_field in ("correctOptionId", "explanation", "editorialNotes", "answers1to50"):
            self.assertNotIn(private_field, serialized)


if __name__ == "__main__":
    unittest.main()
