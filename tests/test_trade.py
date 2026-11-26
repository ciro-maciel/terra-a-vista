"""Air routes: airports add up per city, near cities and same-city hops are left out, largest first."""

import unittest

from pipeline.build import trade

CITIES = {
    "SP": {"x": 0.0, "y": 0.0, "cell": 1}, "RJ": {"x": 350.0, "y": 0.0, "cell": 2},
    "CPS": {"x": 80.0, "y": 0.0, "cell": 3}, "BSB": {"x": 0.0, "y": 900.0, "cell": 4},
}
AIRPORT_CITY = {"SBGR": "SP", "SBSP": "SP", "SBRJ": "RJ", "SBGL": "RJ", "SBKP": "CPS", "SBBR": "BSB"}


class AirRoutesTest(unittest.TestCase):
    def test_airports_of_one_city_add_up(self):
        pairs = {"SBRJ-SBSP": 3_000_000, "SBGL-SBGR": 1_000_000, "SBBR-SBGR": 2_500_000}
        r = trade.air_routes(pairs, AIRPORT_CITY, CITIES)
        self.assertEqual([(x["a"], x["b"], x["pax"]) for x in r], [("RJ", "SP", 4_000_000), ("BSB", "SP", 2_500_000)])
        self.assertEqual([x["rank"] for x in r], [1, 2])

    def test_near_cities_and_same_city_are_left_out(self):
        pairs = {"SBGR-SBKP": 900_000, "SBGR-SBSP": 50_000, "SBKP-SBXX": 10}
        self.assertEqual(trade.air_routes(pairs, AIRPORT_CITY, CITIES), [])


if __name__ == "__main__":
    unittest.main()
