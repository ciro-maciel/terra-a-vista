"""The English dictionary covers every interface text and never breaks a placeholder or a tag."""
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
import i18n  # noqa: E402


class CodeKeys(unittest.TestCase):
    def test_reads_tr_calls_with_escapes(self):
        src = 'a = tr("Olá, {0}\\n", x); b = tr(\'Só \\\'isto\\\'\'); c = t("não"); d = obj.tr("nem");'
        self.assertEqual(i18n.code_keys(src), {"Olá, {0}\n", "Só 'isto'"})


class Broken(unittest.TestCase):
    def test_good_translation(self):
        self.assertIsNone(i18n.broken("<p>Sem dados para {0}.</p>", "<p>No data for {0}.</p>"))

    def test_lost_placeholder(self):
        self.assertIn("placeholders", i18n.broken("Ano {0} · {1}", "Year {0}"))

    def test_lost_tag(self):
        self.assertEqual(i18n.broken("<b>{0}</b> pessoas", "{0} people"), "tags differ")

    def test_edge_space(self):
        self.assertEqual(i18n.broken(" · desde {0}", "· since {0}"), "edge spaces differ")


class Dictionary(unittest.TestCase):
    """The shipped dictionary: every interface key translated, no translation broken."""

    @classmethod
    def setUpClass(cls):
        cls.keys = i18n.all_keys()
        cls.en = i18n.load_dict()

    def test_every_interface_text_has_english(self):
        ui = self.keys["code"] | self.keys["pages"] | self.keys["extra"]
        missing = sorted(k for k in ui if k not in self.en)
        self.assertEqual(missing, [], f"{len(missing)} texts without English: run tools/i18n.py")

    def test_no_translation_breaks_its_key(self):
        bad = {k: why for k, v in self.en.items() if (why := i18n.broken(k, v))}
        self.assertEqual(bad, {})

    def test_place_names_are_not_keys(self):
        # Municipality and city names stay as they are (a town called Floresta must not become "Forest"):
        # none of them may be gathered from the place-name paths of web/i18n/skip.json.
        world = json.loads((i18n.WEB / "data" / "world.json").read_text(encoding="utf-8"))
        names = {c["name"] for c in world.get("counties", [])}
        self.assertIn("Bonfinópolis", names)
        self.assertNotIn("Bonfinópolis", self.keys["data"])


if __name__ == "__main__":
    unittest.main()
