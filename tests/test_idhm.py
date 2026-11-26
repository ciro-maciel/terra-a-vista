import unittest

from pipeline.build.series_util import _round


class Rounding(unittest.TestCase):
    def test_an_index_keeps_three_decimals(self):
        self.assertEqual(_round(0.55849, "float", fixed=3), 0.558)

    def test_other_floats_keep_one(self):
        self.assertEqual(_round(12.345, "float"), 12.3)


if __name__ == "__main__":
    unittest.main()
