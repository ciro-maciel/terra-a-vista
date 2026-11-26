"""The map projection puts Brazil the right way up and the inverse returns the same place."""

import unittest

from pipeline.core.geo import Albers, MapProjection

# (lon, lat) of a few capitals
MANAUS = (-60.02, -3.10)
PORTO_ALEGRE = (-51.23, -30.03)
RECIFE = (-34.88, -8.05)
RIO_BRANCO = (-67.81, -9.97)
BOA_VISTA = (-60.67, 2.82)  # north of the equator
CHUI = (-53.46, -33.69)


class TestProjectionBrazil(unittest.TestCase):
    def setUp(self):
        a = Albers()
        xs, ys = zip(*(a(*p) for p in (RIO_BRANCO, RECIFE, BOA_VISTA, CHUI)))
        self.proj = MapProjection(min(xs), max(ys), 200.0)

    def test_north_is_up(self):
        # map y points down: a place further north has a smaller y
        self.assertLess(self.proj(*MANAUS)[1], self.proj(*PORTO_ALEGRE)[1])
        self.assertLess(self.proj(*BOA_VISTA)[1], self.proj(*MANAUS)[1])

    def test_east_is_right(self):
        self.assertGreater(self.proj(*RECIFE)[0], self.proj(*RIO_BRANCO)[0])

    def test_inverse_round_trip(self):
        for lon, lat in (MANAUS, PORTO_ALEGRE, RECIFE, RIO_BRANCO, BOA_VISTA, CHUI):
            x, y = self.proj(lon, lat)
            lon2, lat2 = self.proj.inverse(x, y)
            self.assertAlmostEqual(lon, lon2, places=6)
            self.assertAlmostEqual(lat, lat2, places=6)

    def test_equal_area_distance(self):
        # Manaus to Porto Alegre is about 3,130 km on the ground; an equal-area conic keeps it within 3%
        import math

        d = math.dist(self.proj(*MANAUS), self.proj(*PORTO_ALEGRE))
        self.assertAlmostEqual(d, 3130, delta=3130 * 0.03)


if __name__ == "__main__":
    unittest.main()
