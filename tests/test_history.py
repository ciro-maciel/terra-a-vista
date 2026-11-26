import unittest

from pipeline.build.history import city_series, deflators

POP = {
    "a": {"1970": 100, "1980": 150},  # the municipality that names the city
    "b": {"1970": None, "1980": 50},  # created after 1970: its people were counted in "a"
    "c": {"1970": None, "1980": None},
}


class CitySeries(unittest.TestCase):
    def test_sums_the_members_that_existed(self):
        self.assertEqual(city_series(POP, ["a", "b"], "a", ["1970", "1980"]), [100, 200])

    def test_no_value_while_the_principal_did_not_exist(self):
        self.assertEqual(city_series(POP, ["c", "a"], "c", ["1970", "1980"]), [None, None])


class Deflators(unittest.TestCase):
    def test_turns_each_year_into_reais_of_the_last_year(self):
        k = deflators({"2002": 100.0, "2003": 110.0, "2004": 121.0}, [2002, 2003, 2004])
        self.assertAlmostEqual(k["2002"], 1.21)
        self.assertAlmostEqual(k["2004"], 1.0)


if __name__ == "__main__":
    unittest.main()
