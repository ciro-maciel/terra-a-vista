import unittest

from pipeline.build.cities import census_profile, gdp_sectors

CENSO = {
    "area_km2": {"a": 100.0, "b": 300.0},
    "median_age": {"a": 30.0, "b": 40.0},
    "ageing_index": {"a": 50.0, "b": 100.0},
    "literacy": {"a": 90.0, "b": 98.0},
    "adults25": {"a": 1000.0, "b": 3000.0},
    "adults25_degree": {"a": 100.0, "b": 900.0},
    "households": {"a": 400.0, "b": 600.0},
    "households_sewer": {"a": 100.0, "b": 500.0},
    "households_water": {"a": 400.0, "b": None},
}
POP = {"a": 1000, "b": 3000}


class CensusProfile(unittest.TestCase):
    def test_counts_are_summed_and_rates_weighted(self):
        p = census_profile(CENSO, ["a", "b"], POP)
        self.assertEqual(p["density"], 10.0)  # 4000 people / 400 km²
        self.assertEqual(p["degrees"], 0.25)  # 1000 / 4000, not the mean of 10% and 30%
        self.assertEqual(p["sewer"], 0.6)
        self.assertEqual(p["median_age"], 37.5)  # (30·1000 + 40·3000) / 4000
        self.assertEqual(p["literacy"], 0.96)  # percent turned into a fraction

    def test_a_missing_member_is_unknown_not_zero(self):
        self.assertIsNone(census_profile(CENSO, ["a", "b"], POP)["water"])
        self.assertEqual(census_profile(CENSO, ["a"], POP)["water"], 1.0)


class GdpSectors(unittest.TestCase):
    def test_sum_and_missing(self):
        s = {"agriculture": {"a": 1, "b": 2}, "industry": {"a": 3, "b": None}}
        self.assertIsNone(gdp_sectors(s, ["a", "b"]))
        self.assertEqual(gdp_sectors(s, ["a"]), {"agriculture": 1, "industry": 3})


if __name__ == "__main__":
    unittest.main()
