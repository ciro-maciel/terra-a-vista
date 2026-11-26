"""districts builder: municipal sums with suppression, location quotients, the district rule, badges and check()."""

import json
import tempfile
import unittest
from pathlib import Path

from pipeline.build import districts as D

OWNS = [1]


def row(emp, chg=0):
    """A municipal entry (one ownership: all employers; CEMPRE has no wages here)."""
    return [[emp, None, chg]]


def cempre():
    """Nation of 1,000,000 jobs; city A = municipalities 1100015 + 1100023, B = 1100031 (inland)."""
    us_frac = {"C": 0.08, "29.1": 0.006, "21": 0.003, "50": 0.0005, "52.3": 0.0007, "06.0": 0.001}
    codes = {c for d in D.CATALOG for c in d["naics"] + list(d["sub"])}
    us = {c: [[int(1_000_000 * us_frac.get(c, 0.01)), None, 0]] for c in codes}
    counties = {c: {} for c in codes}
    # A: 100,000 jobs; manufacturing 15,000 + a suppressed municipality (LQ >= 1.9), autos 6,000 (LQ 10)
    counties["C"]["1100015"] = row(15000)
    counties["C"]["1100023"] = [None]  # suppressed
    counties["29.1"]["1100015"] = row(6000)
    counties["50"]["1100015"] = row(3000)
    counties["52.3"]["1100015"] = row(2000)
    # B: 50,000 jobs; plain-sized manufacturing (LQ 1.0) but pharma at LQ 8
    counties["C"]["1100031"] = row(4000)
    counties["21"]["1100031"] = row(1200)
    counties["50"]["1100031"] = row(3000)
    return {"year": 2024, "vintage": "CEMPRE 2024", "owns": OWNS, "us": us,
            "us_total": [1_000_000, None, 0],
            "totals": {"1100015": [80000, None], "1100023": [20000, None], "1100031": [50000, None], "1100049": None},
            "counties": counties, "codes": {c: c for c in codes}}


class MetricsTest(unittest.TestCase):
    def setUp(self):
        self.m = D.Metrics(cempre())

    def test_suppressed_municipalities_are_left_out_and_counted(self):
        v = self.m.industry(["C"], OWNS, ["1100015", "1100023"])
        self.assertEqual(v["emp"], 15000)
        self.assertEqual(v["suppressed"], 1)

    def test_all_suppressed_is_null_and_absent_is_zero(self):
        self.assertIsNone(self.m.industry(["C"], OWNS, ["1100023"])["emp"])
        self.assertEqual(self.m.industry(["15.3"], OWNS, ["1100015"])["emp"], 0)

    def test_totals_skip_suppressed_and_unknown_wages_stay_unknown(self):
        self.assertEqual(self.m.total(["1100015", "1100023", "1100049"]), {"emp": 100000, "wages": None, "known": 2})
        self.assertIsNone(self.m.total(["1100049"])["emp"])
        self.assertIsNone(self.m.industry(["C"], OWNS, ["1100015"])["wages"])

    def test_lq(self):
        self.assertAlmostEqual(D.lq(20000, 100000, 80000, 1_000_000), 2.5)
        self.assertIsNone(D.lq(None, 100000, 80000, 1_000_000))
        self.assertIsNone(D.lq(5, 0, 80000, 1_000_000))
        self.assertEqual(D.excess(1000, 0.8), 0)
        self.assertAlmostEqual(D.excess(1000, 4), 750)


class RuleTest(unittest.TestCase):
    def setUp(self):
        self.m = D.Metrics(cempre())

    def test_broad_district_with_lower_bound(self):
        ds = D.evaluate(self.m, ["1100015", "1100023"], 100000)
        iz = next(d for d in ds if d["id"] == "industrial_zone")
        self.assertEqual(iz["via"], "broad")
        self.assertEqual(iz["sub"], "29.1")
        self.assertTrue(iz["lower_bound"])
        self.assertEqual(iz["suppressed"], 1)
        self.assertIsNone(iz["avg_pay"])

    def test_specialty_district(self):
        ds = D.evaluate(self.m, ["1100031"], 50000, wet=False)
        iz = next(d for d in ds if d["id"] == "industrial_zone")
        self.assertEqual(iz["via"], "specialty")
        self.assertEqual(iz["sub"], "21")
        self.assertLess(iz["lq"], D.MIN_LQ)

    def test_specialty_needs_min_jobs(self):
        q = cempre()
        q["counties"]["21"]["1100031"] = row(400)
        ds = D.evaluate(D.Metrics(q), ["1100031"], 50000, wet=False)
        self.assertNotIn("industrial_zone", [d["id"] for d in ds])

    def test_harbor_needs_water(self):
        self.assertIn("harbor", [d["id"] for d in D.evaluate(self.m, ["1100031"], 50000, wet=True)])
        self.assertNotIn("harbor", [d["id"] for d in D.evaluate(self.m, ["1100031"], 50000, wet=False)])

    def test_ranked_by_strength_and_capped(self):
        ds = D.evaluate(self.m, ["1100015", "1100023"], 100000)
        self.assertEqual([d["strength"] for d in ds], sorted((d["strength"] for d in ds), reverse=True))
        self.assertLessEqual(len(ds), D.MAX_PER_CITY)

    def test_badges(self):
        ds = D.evaluate(self.m, ["1100015", "1100023"], 100000)
        b = D.badge_for(ds[0])
        self.assertEqual(b["district"], ds[0]["id"])
        self.assertIsNone(D.badge_for(None))
        best = {"id": "industrial_zone", "lq": 1.4, "sub": "29.1", "sub_lq": 7.0}
        self.assertEqual(D.badge_for(best)["label"], "Cidade do automóvel")
        self.assertEqual(D.badge_for(dict(best, sub_lq=2.0))["label"], "Cidade industrial")
        gov = {"id": "government_plaza", "lq": 3.0, "sub": "84.1", "sub_lq": 5.0}
        self.assertEqual(D.badge_for(gov, capital=True)["label"], "Capital federal")
        self.assertIn("7,0×", D.badge_for(best)["text"])

    def test_one_vocabulary_of_nicknames(self):
        for d in D.CATALOG:
            self.assertIn(" ", d["badge"]["label"], d["id"])  # a nickname, never a bare adjective
            for label in d["badge"]["labels"].values():
                self.assertRegex(label, r"^(Cidade|Polo|Capital|Centro) ", d["id"])

    def test_extreme_district_names_the_badge(self):
        ds = [{"id": "industrial_zone", "lq": 1.6, "share": 0.13, "emp": 13000, "strength": 13245},
              {"id": "aerodrome", "lq": 13.0, "share": 0.047, "emp": 4700, "strength": 11693},
              {"id": "harbor", "lq": 3.0, "share": 0.028, "emp": 2800, "strength": 5730}]
        self.assertEqual(D.badge_district(ds)["id"], "aerodrome")
        ds[1]["share"] = 0.02  # extreme but small: the strongest district stays
        self.assertEqual(D.badge_district(ds)["id"], "industrial_zone")
        self.assertIsNone(D.badge_district([]))

    def test_extreme_specialty_names_the_badge(self):
        # Macaé-like: the water transport district is extreme, but oil and gas inside the industrial zone is 80×
        ds = [{"id": "harbor", "lq": 21.0, "share": 0.06, "emp": 6000, "strength": 5700,
               "sub": None, "sub_lq": None, "sub_emp": None},
              {"id": "industrial_zone", "lq": 1.8, "share": 0.25, "emp": 25000, "strength": 11000,
               "sub": "06.0", "sub_lq": 80.0, "sub_emp": 11000}]
        self.assertEqual(D.badge_district(ds)["id"], "industrial_zone")
        ds[1]["sub_emp"] = 2000  # 2% of the jobs: not extreme, the extreme harbor wins
        self.assertEqual(D.badge_district(ds)["id"], "harbor")


class CheckTest(unittest.TestCase):
    def doc(self):
        m = D.Metrics(cempre())
        ds = D.evaluate(m, ["1100015", "1100023"], 100000)
        return {"version": 1, "vintage": "v", "year": 2024, "sources": ["ibge_cempre"], "rule": {"text": D.RULE_TEXT},
                "catalog": D.CATALOG, "industries": {"29": {"title": "x", "us_emp": 6000}},
                "national": {"emp": 1_000_000, "avg_pay": None},
                "cities": {"A": {"emp": 100000, "avg_pay": None, "counties": [2, 2],
                                 "top": [{"naics": "29", "emp": 6000, "lq": 10.0}],
                                 "districts": ds, "badge": D.badge_for(ds[0])},
                           "B": None},
                "counties": {}}

    def run_check(self, doc, cities=None):
        with tempfile.TemporaryDirectory() as tmp:
            if doc is not None:
                (Path(tmp) / "districts.json").write_text(json.dumps(doc))
            if cities is not None:
                (Path(tmp) / "cities.json").write_text(json.dumps(cities))
            return D.check(Path(tmp))

    def test_missing_file_is_a_note(self):
        self.assertEqual([lv for lv, _ in self.run_check(None)], ["NOTE"])

    def test_valid(self):
        lines = self.run_check(self.doc(), [{"id": "A"}, {"id": "B"}])
        self.assertFalse([m for lv, m in lines if lv == "FAIL"], lines)

    def test_violations(self):
        cases = {
            "badge": lambda d: d["cities"]["A"].update(badge=None),
            "badge district": lambda d: d["cities"]["A"]["badge"].update(district="spaceport"),
            "lower_bound": lambda d: d["cities"]["A"]["districts"][0].update(lower_bound=False, suppressed=3),
            "unknown": lambda d: d["cities"]["A"]["districts"].append({"id": "spaceport", "emp": 1}),
            "catalog": lambda d: d["catalog"].pop(),
            "top": lambda d: d["cities"]["A"]["top"].append({"naics": "9999"}),
        }
        for what, change in cases.items():
            d = self.doc()
            change(d)
            with self.subTest(what=what):
                self.assertTrue(any(lv == "FAIL" for lv, _ in self.run_check(d)), what)
        self.assertTrue(any(lv == "FAIL" for lv, _ in self.run_check(self.doc(), [{"id": "A"}, {"id": "C"}])))


class CapitalTest(unittest.TestCase):
    def test_state_capital_cities_only(self):
        h = D.holds_state_capital
        self.assertTrue(h({"counties": ["3205002", "3205309"]}))  # Grande Vitória holds Vitória
        self.assertFalse(h({"counties": ["3509502"]}))  # Campinas

    def test_state_capital_label(self):
        best = {"id": "government_plaza", "sub": "84.1", "sub_lq": 9.0, "lq": 2.0, "lower_bound": False,
                "sub_lower_bound": True}
        self.assertEqual(D.badge_for(best, state_capital=True)["label"], "Capital estadual")
        b = D.badge_for(best, state_capital=False)
        self.assertEqual(b["label"], "Cidade do governo")
        self.assertIn("≥ 9,0×", b["text"])


if __name__ == "__main__":
    unittest.main()
