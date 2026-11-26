import unittest

from pipeline.build.exports import bearing, short_name
from pipeline.sources.comex_stat import norm, split_name


class Names(unittest.TestCase):
    def test_accents_case_and_apostrophes_do_not_matter(self):
        self.assertEqual(norm("Pau D'Arco"), norm("Pau d'Arco"))
        self.assertEqual(norm("São João"), "saojoao")

    def test_the_state_comes_after_the_last_dash(self):
        self.assertEqual(split_name("Conceição do Lago-Açu - MA"), ("Conceição do Lago-Açu", "MA"))


class Bearing(unittest.TestCase):
    def test_north_east_south_west(self):
        self.assertEqual(bearing(0, 0, 0, 10), 0)
        self.assertEqual(bearing(0, 0, 10, 0), 90)
        self.assertEqual(bearing(0, 10, 0, 0), 180)
        self.assertEqual(bearing(10, 0, 0, 0), 270)

    def test_brasilia_to_washington_is_north_west(self):
        self.assertTrue(300 < bearing(-47.9, -15.8, -77.0, 38.9) < 345)


class Products(unittest.TestCase):
    def test_known_heading_gets_its_short_name(self):
        self.assertEqual(short_name("1201", "Soja, mesmo triturada"), "Soja")

    def test_other_headings_are_cut_at_the_first_comma(self):
        self.assertEqual(short_name("9999", "Bombas para líquidos, mesmo com dispositivo medidor"), "Bombas para líquidos")


if __name__ == "__main__":
    unittest.main()
