import unittest

from pipeline.build.series_health import window
from pipeline.sources.datasus import parse_tabnet

ANSWER = """<html><PRE>
"Munic&iacute;pio";"2022";"2023";"Total"
" MUNICIPIO IGNORADO - RO";3;-;3
"110001 ALTA FLORESTA D'OESTE";2;4;6
"Total";1.234;5;1.239
</PRE></html>"""

HAVE = [str(y) for y in range(1999, 2025)]


class TabNet(unittest.TestCase):
    def test_reads_municipalities_and_skips_ignored_and_total(self):
        head, rows = parse_tabnet(ANSWER)
        self.assertEqual(head, ["2022", "2023", "Total"])
        self.assertEqual(rows, {"110001": [2.0, 4.0, 6.0]})


class Window(unittest.TestCase):
    def test_sums_the_year_and_its_neighbours(self):
        counts = {"2009": 1, "2010": 2, "2011": 3}
        self.assertEqual(window(counts, "2010", HAVE), 6)

    def test_the_last_year_sums_the_two_before(self):
        counts = {"2022": 1, "2023": 2, "2024": 3}
        self.assertEqual(window(counts, "2024", HAVE), 6)

    def test_a_missing_year_gives_no_value(self):
        self.assertIsNone(window({"2010": 2, "2011": 3}, "2010", HAVE))


if __name__ == "__main__":
    unittest.main()
