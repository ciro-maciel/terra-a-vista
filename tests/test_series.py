import unittest

from pipeline.build.series_land import zero_filled
from pipeline.build.series_util import aggregate, fixed_domain
from pipeline.sources.mapbiomas import GROUPS


def groups_of(cid, l0, l2):
    return {g for g, f in GROUPS.items() if f(cid, l0, l2)}


class Aggregate(unittest.TestCase):
    def test_sums_numerators_over_denominators(self):
        num = {"a": {"2000": 10}, "b": {"2000": 30}}
        den = {"a": {"2000": 100}, "b": {"2000": 100}}
        self.assertEqual(aggregate(num, den, ["a", "b"], ["2000"]), [0.2])

    def test_a_municipality_without_the_class_still_counts_its_area(self):
        area = {"a": {"2000": 100.0}, "b": {"2000": 300.0}}
        soy = {"a": {"2000": 40.0}}  # "b" never grew soy: absent from the MapBiomas rows
        self.assertEqual(aggregate(zero_filled(soy, area), area, ["a", "b"], ["2000"]), [0.1])

    def test_no_data_is_none(self):
        self.assertEqual(aggregate({}, {}, ["a"], ["2000"]), [None])


class FixedDomain(unittest.TestCase):
    def test_floor_keeps_shares_from_starting_below_zero(self):
        self.assertEqual(fixed_domain([0.0] * 50 + [0.5] * 50, lo_floor=0)[0], 0)


class MapBiomasGroups(unittest.TestCase):
    def test_soy_is_agriculture_not_natural(self):
        self.assertEqual(groups_of(39, "Anthropic", "3.2. Agriculture"), {"agriculture", "soy"})

    def test_savanna_is_natural_and_forest(self):
        self.assertEqual(groups_of(4, "Natural", "1.2. Savanna Formation"), {"natural", "forest"})

    def test_pasture_is_only_pasture(self):
        self.assertEqual(groups_of(15, "Anthropic", "3.1. Pasture"), {"pasture"})


if __name__ == "__main__":
    unittest.main()
