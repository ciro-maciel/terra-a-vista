"""Contas das prefeituras (Siconfi): de onde vem o dinheiro de cada prefeitura, para o "por quê" e a lente.

Por município: receita total, impostos e taxas próprios, transferências correntes e de capital, e dentro delas o FPM,
a parte do ICMS e os royalties. Uma cidade e um estado somam as suas prefeituras que entregaram a declaração.
"""

from __future__ import annotations

import json
from pathlib import Path

from ..core.paths import WEB_DATA
from ..core.store import load_interim, write_web

REQUIRES = ["siconfi", "ibge_census", "ibge_boundaries", "cities.json"]
PRODUCES = ["finances.json"]
KEYS = ["total", "own", "transfers", "capital_transfers", "fpm", "icms", "royalties"]

RULE = ("Receita bruta realizada no ano pela prefeitura, pela declaração de contas anuais que ela entrega ao Tesouro "
        "(Siconfi, DCA anexo I-C). Dinheiro próprio são os impostos e taxas que a prefeitura cobra (IPTU, ISS, ITBI e "
        "taxas). As transferências vêm da União (o FPM) e do estado (a parte do ICMS e do IPVA), além de convênios. Os "
        "royalties pagam a exploração de petróleo, minérios e água no município. Uma cidade ou um estado somam só as "
        "prefeituras que entregaram a declaração; ficam de fora as que não entregaram e as poucas cuja declaração não fecha "
        "(imposto próprio negativo ou partes maiores que o total, quase todas no Tocantins).")


def plausible(row: dict) -> bool:
    """A declaration that adds up: a positive total, own taxes not negative, and the parts not above the total."""
    t, own = row.get("total") or 0, row.get("own") or 0
    parts = own + (row.get("transfers") or 0) + (row.get("capital_transfers") or 0)
    return t > 0 and 0 <= own <= t and parts <= 1.05 * t


def share_own(row: dict) -> float | None:
    """Own taxes and fees ÷ total revenue (None without a total)."""
    t = row.get("total")
    return None if not t else (row.get("own") or 0) / t


def sum_rows(rows: list[dict]) -> dict:
    out = {k: 0.0 for k in KEYS}
    for r in rows:
        for k in KEYS:
            out[k] += r.get(k) or 0
    return out


def build() -> None:
    sc = load_interim("siconfi")
    pop = load_interim("ibge_census")["municipalities"]
    states = load_interim("ibge_boundaries")["states"]
    cities = json.loads((WEB_DATA / "cities.json").read_text())
    m = {c: r for c, r in sc["municipalities"].items() if plausible(r)}
    dropped = sum(1 for r in sc["municipalities"].values() if r.get("total") and not plausible(r))
    pack = lambda r: [round(r.get(k) or 0) for k in KEYS]
    blob = lambda codes: (lambda rows: {"n": len(rows), "pop": sum(pop.get(c) or 0 for c in codes if c in m),
                                        **{k: round(v) for k, v in sum_rows(rows).items()}})([m[c] for c in codes if c in m])
    all_codes = list(pop)
    write_web("finances.json", {
        "version": 1, "year": sc["year"], "vintage": sc.get("vintage"), "sources": ["siconfi"], "rule": RULE,
        "keys": KEYS, "munis": {c: pack(r) for c, r in m.items()},
        "cities": {c["id"]: blob(c["counties"]) for c in cities},
        "states": {s["abbr"]: blob([c for c in all_codes if c[:2] == s["fips"]]) for s in states},
        "nation": blob(all_codes), "municipalities_total": len(all_codes), "dropped": dropped,
    })
    print(f"    {len(m)} of {len(all_codes)} city halls declared {sc['year']}; {dropped} declarations that do not add up left out")


def check(web_dir) -> list[tuple[str, str]]:
    p = Path(web_dir) / "finances.json"
    if not p.exists():
        return [("NOTE", "finances.json: missing (optional, skipped)")]
    d = json.loads(p.read_text())
    n = len(d["munis"])
    if n < 0.9 * d["municipalities_total"]:
        return [("FAIL", f"finances.json: only {n} of {d['municipalities_total']} city halls")]
    return [("PASS", f"finances.json: {n} of {d['municipalities_total']} city halls, {d['year']}")]
