"""Brazilian lenses: municipal formulas, the unknown stays unknown, the colour domain, the city labour figures."""

import unittest

from pipeline.build import lenses as L
from pipeline.build.cities import labour

CENSO = {
    "earnings_total": {"A": 3_000_000.0, "B": None}, "employed": {"A": 1000.0, "B": 10.0},
    "unemployed": {"A": 60.0, "B": 5.0}, "labour_force": {"A": 1060.0, "B": 0.0},
    "literacy": {"A": 93.5, "B": None}, "median_age": {}, "ageing_index": {}, "adults25": {}, "adults25_degree": {},
    "households": {}, "households_sewer": {}, "households_water": {},
}


def lens(lid, m):
    return L.MUNICIPAL_LENSES[lid][0](CENSO, {"A": 100}, {"A": 5e6}, m)


class LensFormulaTest(unittest.TestCase):
    def test_income_is_earnings_per_worker(self):
        self.assertEqual(lens("income", "A"), 3000)
        self.assertIsNone(lens("income", "B"))  # unknown earnings stay unknown

    def test_unemployment_and_zero_labour_force(self):
        self.assertAlmostEqual(lens("unemployment", "A"), 60 / 1060)
        self.assertIsNone(lens("unemployment", "B"))  # no labour force: no rate, never 0

    def test_literacy_is_a_fraction(self):
        self.assertAlmostEqual(lens("literacy", "A"), 0.935)
        self.assertIsNone(lens("literacy", "B"))

    def test_gdp_per_person(self):
        self.assertEqual(lens("gdp_pc", "A"), 50_000)

    def test_percentile_domain(self):
        self.assertEqual(L.percentile_domain([None, 1, 2, 3, 4, 100], log=False), [1, 4])  # the outlier is clipped
        self.assertIsNone(L.percentile_domain([None, None], log=False))
        self.assertEqual(L.percentile_domain([0, 10, 20], log=True), [10, 20])


class CityLabourTest(unittest.TestCase):
    def test_city_adds_up_its_municipalities(self):
        c = {"earnings_total": {"A": 3000.0, "C": 1000.0}, "employed": {"A": 1.0, "C": 1.0},
             "unemployed": {"A": 1.0, "C": 3.0}, "labour_force": {"A": 10.0, "C": 30.0}}
        self.assertEqual(labour(c, ["A", "C"]), {"income": 2000, "unemployment": 0.1})
        c["employed"]["C"] = None
        self.assertIsNone(labour(c, ["A", "C"])["income"])  # a member unknown: the city is unknown


if __name__ == "__main__":
    unittest.main()
