import math
import unittest

from pipeline.build.protected import kind_of, sample_offsets


class Samples(unittest.TestCase):
    def test_nineteen_points_inside_the_hex(self):
        pts = sample_offsets(25.0)
        self.assertEqual(len(pts), 19)
        self.assertTrue(all(math.hypot(x, y) < 25.0 * math.sqrt(3) / 2 for x, y in pts))  # inside the inscribed circle


class Kinds(unittest.TestCase):
    def test_indigenous_land_and_the_two_groups(self):
        self.assertEqual(kind_of("ti", {}), "ti")
        self.assertEqual(kind_of("uc", {"grupo": "Proteção Integral"}), "pi")
        self.assertEqual(kind_of("uc", {"grupo": "Uso Sustentável"}), "us")


if __name__ == "__main__":
    unittest.main()
