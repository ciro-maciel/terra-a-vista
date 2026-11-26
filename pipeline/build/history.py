"""História: a população de cada Censo desde 1970 e o PIB real desde 2002, para a linha do tempo e o "por quê".

A população de uma cidade num Censo é a soma dos seus municípios que já existiam naquele ano (o povo de um município
criado depois foi contado no município de onde ele saiu); se o município que dá nome à cidade ainda não existia, a
cidade fica sem valor naquele ano. O PIB segue a mesma regra e é levado a reais do último ano do PIB pelo deflator do PIB
(Contas Nacionais), como o IBGE mede o crescimento real.

Também guarda, para o "por quê", cada município: nome, UF, população de 2022, PIB do último ano e as estimativas do
primeiro e do último ano do crescimento.
"""

from __future__ import annotations

import json
from pathlib import Path

from ..core.paths import WEB_DATA
from ..core.store import load_interim, write_web

REQUIRES = ["ibge_history", "ibge_census", "ibge_gdp", "ibge_estimates", "ibge_boundaries", "cities.json"]
PRODUCES = ["history.json"]

RULE = ("A população vem só das contagens dos Censos (1970, 1980, 1991, 2000, 2010 e 2022), nunca das estimativas "
        "anuais entre eles. Cada Censo usa os limites da sua época: a população de uma cidade soma os seus municípios "
        "que já existiam (o povo de um município criado depois foi contado no município de onde ele saiu), e a cidade "
        "fica sem valor quando o município que lhe dá nome ainda não existia. O PIB é levado a reais do último ano "
        "pelo deflator do PIB do Brasil (Contas Nacionais), o mesmo para todo município.")


def city_series(values: dict, members: list[str], principal: str, years: list[str]) -> list[int | None]:
    """One number per year: the sum of the members that have a value, or None when the principal has none."""
    out = []
    for y in years:
        if (values.get(principal) or {}).get(y) is None:
            out.append(None)
            continue
        out.append(round(sum((values.get(m) or {}).get(y) or 0 for m in members)))
    return out


def deflators(index: dict[str, float], years: list[int]) -> dict[str, float]:
    """Factor that turns current reais of each year into reais of the last year (an index of the GDP deflator)."""
    base = index[str(years[-1])]
    return {str(y): base / index[str(y)] for y in years}


def build() -> None:
    h = load_interim("ibge_history")
    census = load_interim("ibge_census")
    gdp_now = load_interim("ibge_gdp")
    est = load_interim("ibge_estimates")
    bounds = load_interim("ibge_boundaries")
    cities = json.loads((WEB_DATA / "cities.json").read_text())

    cyears = [str(y) for y in h["census_years"]] + ["2022"]
    gyears = [str(y) for y in h["gdp_years"]]
    k = deflators(h["deflator_index"], h["gdp_years"])

    def pop_of(level):
        p = {code: dict(v) for code, v in h[level]["population"].items()}
        for code, v in census[level].items():
            p.setdefault(code, {})["2022"] = v
        return p

    def real(series):  # current reais → reais of the last GDP year, in R$ mil
        return [None if v is None else round(v * k[y] / 1000) for v, y in zip(series, gyears)]

    out_cities = {}
    mp, mg = pop_of("municipalities"), h["municipalities"]["gdp"]
    for c in cities:
        out_cities[c["id"]] = {"p": city_series(mp, c["counties"], c["id"], cyears),
                               "g": real(city_series(mg, c["counties"], c["id"], gyears))}

    abbr = {s["fips"]: s["abbr"] for s in bounds["states"]}
    sp, sg = pop_of("states"), h["states"]["gdp"]
    out_states = {abbr[f]: {"p": [sp.get(f, {}).get(y) for y in cyears],
                            "g": real([sg.get(f, {}).get(y) for y in gyears])} for f in abbr}
    np_, ng = pop_of("nation"), h["nation"]["gdp"]
    nation = {"p": [np_["1"].get(y) for y in cyears], "g": real([ng["1"].get(y) for y in gyears])}

    first, last = str(est["years"][0]), str(est["years"][-1])
    munis = {}
    for m in bounds["counties"]:
        code = m["geoid"]
        e = est["municipalities"].get(code, {})
        g = gdp_now["municipalities"].get(code)
        munis[code] = [m["name"], abbr.get(code[:2]), census["municipalities"].get(code),
                       None if g is None else round(g / 1000), e.get(first), e.get(last)]

    write_web("history.json", {
        "version": 1, "vintage": f"Censos de 1970 a 2022, PIB dos Municípios {gyears[0]} a {gyears[-1]}",
        "sources": ["ibge_history", "ibge_census", "ibge_gdp", "ibge_estimates"],
        "census_years": [int(y) for y in cyears], "gdp_years": [int(y) for y in gyears],
        "gdp_unit": f"R$ mil de {gyears[-1]} (deflator do PIB)", "deflator": {y: round(v, 4) for y, v in k.items()},
        "estimate_years": [int(first), int(last)], "rule": RULE,
        "muni_columns": ["name", "uf", "population_2022", "gdp_rs_mil", f"estimate_{first}", f"estimate_{last}"],
        "nation": nation, "states": out_states, "cities": out_cities, "munis": munis,
    })
    br = nation["p"]
    print(f"    Brasil {br[0]:,} (1970) → {br[-1]:,} (2022); "
          f"{sum(1 for v in out_cities.values() if v['p'][0] is not None)} of {len(out_cities)} cities have 1970")


def check(web_dir: Path) -> list[tuple[str, str]]:
    p = Path(web_dir) / "history.json"
    if not p.exists():
        return [("NOTE", "history.json: missing (optional, skipped)")]
    doc = json.loads(p.read_text())
    n = len(doc["census_years"])
    bad = [cid for cid, v in doc["cities"].items() if len(v["p"]) != n or v["p"][-1] is None]
    if bad:
        return [("FAIL", f"history.json: cities without the 2022 count or with a short series: {bad[:5]}")]
    br = doc["nation"]["p"]
    if any(v is None for v in br):
        return [("FAIL", "history.json: the national series has a gap")]
    return [("PASS", f"history.json: {len(doc['cities'])} cities, censuses {doc['census_years'][0]} to {doc['census_years'][-1]}")]
