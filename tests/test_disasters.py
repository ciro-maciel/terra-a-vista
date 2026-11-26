import unittest

from pipeline.build.series_disasters import by_period
from pipeline.sources.atlas_desastres import GROUPS, _int


class Periods(unittest.TestCase):
    def test_years_fall_in_their_five_year_window(self):
        p = by_period({"1991": 1, "1995": 2, "1996": 4, "2025": 8})
        self.assertEqual(p["1995"], 3.0)   # 1991 to 1995
        self.assertEqual(p["2000"], 4.0)   # 1996 to 2000
        self.assertEqual(p["2025"], 8.0)


class Records(unittest.TestCase):
    def test_floods_and_downpours_are_rain(self):
        self.assertEqual({GROUPS[k] for k in ("Enxurradas", "Inundações", "Alagamentos", "Chuvas Intensas")}, {"rain"})

    def test_counts_tolerate_blanks_and_decimals(self):
        self.assertEqual(_int(""), 0)
        self.assertEqual(_int("3.00"), 3)


if __name__ == "__main__":
    unittest.main()
