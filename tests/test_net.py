import unittest

from pipeline.build.series_net import coverage
from pipeline.build.series_util import aggregate
from pipeline.sources.anatel import num


class Numbers(unittest.TestCase):
    def test_brazilian_decimal_comma(self):
        self.assertAlmostEqual(num("62,467562"), 62.467562)
        self.assertIsNone(num(""))


class Coverage(unittest.TestCase):
    def test_a_group_weights_each_town_by_its_people(self):
        n, d = coverage({"big": {"2025": 1.0}, "small": {"2025": 0.0}}, {"big": 900, "small": 100})
        self.assertAlmostEqual(aggregate(n, d, ["big", "small"], ["2025"])[0], 0.9)


if __name__ == "__main__":
    unittest.main()
