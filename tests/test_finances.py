import unittest

from pipeline.build.finances import plausible, share_own, sum_rows
from pipeline.sources.siconfi import keep


class Keep(unittest.TestCase):
    def test_keeps_only_the_gross_column_of_the_mapped_accounts(self):
        rows = [
            {"cod_conta": "RO1.1.0.0.00.0.0", "coluna": "Receitas Brutas Realizadas", "valor": 10.0},
            {"cod_conta": "RO1.1.0.0.00.0.0", "coluna": "Deduções - FUNDEB", "valor": 3.0},
            {"cod_conta": "RO9.9", "coluna": "Receitas Brutas Realizadas", "valor": 99.0},
        ]
        self.assertEqual(keep(rows), {"own": 10.0})


class Shares(unittest.TestCase):
    def test_own_share(self):
        self.assertEqual(share_own({"total": 200.0, "own": 50.0}), 0.25)
        self.assertIsNone(share_own({"own": 50.0}))

    def test_groups_add_up(self):
        self.assertEqual(sum_rows([{"total": 1, "own": 1}, {"total": 2}])["total"], 3)


class Plausible(unittest.TestCase):
    def test_a_negative_own_revenue_is_a_bad_declaration(self):
        self.assertFalse(plausible({"total": 39.0, "own": -9.7, "transfers": 47.9}))

    def test_a_declaration_that_adds_up_passes(self):
        self.assertTrue(plausible({"total": 100.0, "own": 20.0, "transfers": 75.0, "capital_transfers": 3.0}))


if __name__ == "__main__":
    unittest.main()
