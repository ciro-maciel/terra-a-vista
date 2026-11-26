import unittest

from pipeline.build.series_school import weighted
from pipeline.build.series_util import aggregate


class Weighted(unittest.TestCase):
    def test_a_group_is_the_population_weighted_mean(self):
        num, den = weighted({"a": {"2023": 6.0}, "b": {"2023": 4.0}}, {"a": 300, "b": 100})
        self.assertAlmostEqual(aggregate(num, den, ["a", "b"], ["2023"])[0], 5.5)

    def test_a_town_without_a_score_does_not_pull_the_mean_down(self):
        num, den = weighted({"a": {"2023": 6.0}, "b": {"2023": None}}, {"a": 300, "b": 100})
        self.assertAlmostEqual(aggregate(num, den, ["a", "b"], ["2023"])[0], 6.0)


if __name__ == "__main__":
    unittest.main()
