"""Brazilian city rules: the name follows the IBGE title, and a sum with an unknown member stays unknown."""

import unittest

from pipeline.build.cities import sum_or_none, title_principal
from pipeline.sources.ibge_arranjos import parse_arranjos
from pipeline.sources.ibge_sidra import sidra_values

VITORIA = {
    "name": "Vitória/ES",
    "members": [
        {"code": "3205002", "name": "Serra", "nucleus": True},
        {"code": "3205309", "name": "Vitória", "nucleus": True},
        {"code": "3205200", "name": "Vila Velha", "nucleus": True},
    ],
}
POP = {"3205002": 520653, "3205309": 322869, "3205200": 467722}


class TestCitiesBrazil(unittest.TestCase):
    def test_title_names_the_city_not_the_largest_member(self):
        self.assertEqual(title_principal(VITORIA, list(POP), POP), "3205309")

    def test_two_town_title_takes_the_first(self):
        a = {"name": "Adamantina - Lucélia/SP", "members": [
            {"code": "3527405", "name": "Lucélia", "nucleus": True},
            {"code": "3500105", "name": "Adamantina", "nucleus": True}]}
        self.assertEqual(title_principal(a, ["3527405", "3500105"], {"3527405": 1, "3500105": 2}), "3500105")

    def test_no_name_match_falls_back_to_largest(self):
        a = {"name": "Outro/XX", "members": VITORIA["members"]}
        self.assertEqual(title_principal(a, list(POP), POP), "3205002")

    def test_sum_with_unknown_member_is_unknown(self):
        self.assertIsNone(sum_or_none([10, None, 5]))
        self.assertEqual(sum_or_none([10, 0, 5]), 15)

    def test_parse_arranjos_rows(self):
        rows = [
            {"A": "Tabela 1.1 Municípios brasileiros que participam de arranjos populacionais – 2010"},
            {"A": "Arranjos populacionais e municípios brasileiros", "B": "Código do município"},
            {"A": "Vitória/ES"},
            {"A": "Serra (ES)", "B": "3205002", "D": "Sim"},
            {"A": "Vitória (ES)", "B": "3205309", "D": "Sim"},
            {"A": "Fonte: IBGE, Censo Demográfico 2010."},
        ]
        out = parse_arranjos(rows)
        self.assertEqual(len(out), 1)
        self.assertEqual([m["name"] for m in out[0]["members"]], ["Serra", "Vitória"])

    def test_sidra_symbols(self):
        import json
        import tempfile

        rows = [{"D1C": "h", "V": "Valor"}, {"D1C": "1", "V": "12"}, {"D1C": "2", "V": "-"},
                {"D1C": "3", "V": "..."}, {"D1C": "4", "V": "X"}]
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
            json.dump(rows, f)
        self.assertEqual(sidra_values(f.name), {"1": 12.0, "2": 0.0, "3": None, "4": None})


if __name__ == "__main__":
    unittest.main()
