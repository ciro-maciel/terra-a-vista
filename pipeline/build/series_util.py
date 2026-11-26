"""Shared shape of the series files (series_<theme>.json) the timeline and the "por quê" read.

A theme has a few metrics, each a ratio num ÷ den kept per municipality and year, so it adds up the same way for
any group: a city is its municipalities summed, a state and the nation too. One file per theme, loaded lazily:

    {"id", "name", "vintage", "sources", "years", "rule", "question", "fixed_borders",
     "metrics": [{"id", "name", "unit", "format", "scale", "domain", "ramp", "higher_is", "description"}],
     "munis":  {metric: [[value per year] per municipality, in world.json "counties" order]} (÷ metric.muni_div),
     "cities": {city id: {metric: [value per year]}},
     "states": {abbr: {metric: [...]}}, "nation": {metric: [...]}}

The colour domain of each metric is fixed across the years (2nd to 98th percentile of every municipality in every
year), so a colour means the same thing in 1985 and in 2025. Values are None where the source has none.
"""

from __future__ import annotations

import json
from pathlib import Path

from ..core.store import load_interim, write_web
from .lenses import RAMPS, nice


def ratio(num, den):
    return None if num is None or den in (None, 0) else num / den


def _round(v, fmt, digits=3, fixed=None):
    if v is None:
        return None
    if fixed is not None:  # the metric says how many decimals it needs (an index from 0 to 1: three)
        return round(v, fixed)
    if fmt == "int":
        return round(v)
    return round(v, digits) if fmt == "pct" else round(v, 1) if abs(v) < 1000 else round(v)


def fixed_domain(values: list, log: bool = False, lo_floor: float | None = None) -> list[float] | None:
    vals = sorted(v for v in values if v is not None and (v > 0 or not log))
    if not vals:
        return None
    lo, hi = vals[int(0.02 * (len(vals) - 1))], vals[int(0.98 * (len(vals) - 1))]
    lo, hi = nice(lo, False), nice(hi, True)
    if lo_floor is not None:
        lo = max(lo, lo_floor)
    if hi <= lo:
        hi = lo + (abs(lo) or 1)
    return [lo, hi]


def aggregate(num: dict, den: dict, codes, years) -> list:
    """Σ num ÷ Σ den over the codes that have both, per year."""
    out = []
    for y in years:
        n = d = 0.0
        have = False
        for c in codes:
            a, b = (num.get(c) or {}).get(y), (den.get(c) or {}).get(y)
            if a is None or b is None:
                continue
            n += a
            d += b
            have = True
        out.append(ratio(n, d) if have else None)
    return out


def build_series(theme: dict, metrics: list[dict]) -> dict:
    """theme: id, name, vintage, sources, years (str), rule. metrics: meta + "num" and "den" ({code: {year: v}})."""
    world = load_interim("_world")
    cities = json.loads((Path(__file__).resolve().parents[2] / "web" / "data" / "cities.json").read_text())
    states = load_interim("ibge_boundaries")["states"]
    codes = world["counties"]
    years = theme["years"]
    out = {k: theme[k] for k in ("id", "name", "vintage", "sources", "rule")}
    out["question"] = theme.get("question")  # the "por quê" title, {first} = the first year
    # True when every year uses today's municipal borders (MapBiomas); False when each year has its own (IBGE surveys),
    # so a municipality that later split looks like it shrank: compare a year with the one before, not the first.
    out["fixed_borders"] = bool(theme.get("fixed_borders", True))
    if theme.get("events"):
        out["events"] = theme["events"]  # notable single events, [{code, year, date, type, dead, homeless}]
    out["compare_from"] = theme.get("compare_from")  # the "por quê" compares from here (earlier years are less complete)
    out["stable_from"] = theme.get("stable_from")  # first year whose borders match today's (almost no new municipality since 2001)
    out["years"] = [int(y) for y in years]
    # A rate over few events (infant deaths in a town of 900) jumps by chance: "who changed most" then looks only at
    # the municipalities with at least this many people (2022 Census), listed by their index in "counties".
    if theme.get("movers_min_pop"):
        pop = load_interim("ibge_census")["municipalities"]
        out["movers_min_pop"] = theme["movers_min_pop"]
        out["movers"] = [k for k, c in enumerate(codes) if (pop.get(c) or 0) >= theme["movers_min_pop"]]
    out.update(metrics=[], munis={}, cities={}, states={}, nation={})
    for m in metrics:
        num, den, fmt = m["num"], m["den"], m.get("format", "pct")
        fx = m.get("digits")
        rows = [[_round(ratio((num.get(c) or {}).get(y), (den.get(c) or {}).get(y)), fmt, fixed=fx) for y in years] for c in codes]
        # shares travel as whole thousandths (0..1000): a third of the size; the browser divides by "muni_div"
        div = 1000 if fmt == "pct" else 1
        agg = m.get("agg_num", num)  # what groups sum: may differ (a municipality not yet created counts as 0)
        # an index with an official value per state and for Brazil (the IDHM) uses it instead of a weighted mean
        st_over, nat_over = m.get("states_official"), m.get("nation_official")
        meta = {k: v for k, v in m.items() if k not in ("num", "den", "agg_num", "states_official", "nation_official")}
        meta.setdefault("format", "pct")
        meta.setdefault("scale", "linear")
        meta.setdefault("higher_is", "neutral")
        ramp = meta.get("ramp", "teal")
        meta["ramp"] = RAMPS[ramp] if isinstance(ramp, str) else ramp
        if "domain" not in meta:
            meta["domain"] = fixed_domain([v for r in rows for v in r], meta["scale"] == "log", m.get("lo_floor"))
        meta.pop("lo_floor", None)
        out["metrics"].append(meta)
        meta["muni_div"] = div
        out["munis"][m["id"]] = [[None if v is None else round(v * div) for v in r] for r in rows] if div != 1 else rows
        for c in cities:
            out["cities"].setdefault(c["id"], {})[m["id"]] = [_round(v, fmt, 4, fx) for v in aggregate(agg, den, c["counties"], years)]
        for s in states:
            members = [c for c in codes if c[:2] == s["fips"]]
            if st_over is not None:
                out["states"].setdefault(s["abbr"], {})[m["id"]] = [(st_over.get(s["abbr"]) or {}).get(y) for y in years]
            else:
                out["states"].setdefault(s["abbr"], {})[m["id"]] = [_round(v, fmt, 4, fx) for v in aggregate(agg, den, members, years)]
        out["nation"][m["id"]] = ([nat_over.get(y) for y in years] if nat_over is not None
                                  else [_round(v, fmt, 4, fx) for v in aggregate(agg, den, codes, years)])
    write_web(f"series_{theme['id']}.json", out)
    return out


def check_series(web_dir, theme_id: str, min_munis: int = 5000) -> list[tuple[str, str]]:
    p = Path(web_dir) / f"series_{theme_id}.json"
    if not p.exists():
        return [("NOTE", f"series_{theme_id}.json: missing (optional, skipped)")]
    doc = json.loads(p.read_text())
    n = len(doc["years"])
    out = []
    for m in doc["metrics"]:
        rows = doc["munis"][m["id"]]
        if any(len(r) != n for r in rows):
            return [("FAIL", f"series_{theme_id}.json: {m['id']} has a row of the wrong length")]
        have = sum(1 for r in rows if r[-1] is not None)
        if have < min_munis:
            out.append(("FAIL", f"series_{theme_id}.json: {m['id']} has only {have} municipalities in {doc['years'][-1]}"))
        nat = doc["nation"][m["id"]]
        k0 = next((k for k, v in enumerate(nat) if v is not None), len(nat))  # a measure may start later
        if k0 == len(nat) or any(v is None for v in nat[k0:]):
            out.append(("FAIL", f"series_{theme_id}.json: {m['id']} national series has a gap"))
    return out or [("PASS", f"series_{theme_id}.json: {len(doc['metrics'])} metrics, {doc['years'][0]} to {doc['years'][-1]}")]
