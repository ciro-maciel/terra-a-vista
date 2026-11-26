"""Rotas aéreas: as maiores ligações de passageiros entre as cidades do mapa (ANAC), desenhadas como arcos.

Brazil has no public freight origin-destination model like the U.S. FAF, so the routes layer shows what the ANAC
statistics do measure: passengers between airports, summed both ways and per pair of map cities (a city with two
airports, São Paulo with Guarulhos and Congonhas, adds them up). The ROUTES largest pairs of cities at least
MIN_KM apart are kept. The arc is a drawing aid between the two city banners, not a flight path.
"""

from __future__ import annotations

import json
import math
from collections import defaultdict
from pathlib import Path

from ..core.paths import WEB_DATA
from ..core.store import load_interim_payload, write_web

REQUIRES = ["anac", "infrastructure.json", "cities.json"]
PRODUCES = ["trade.json"]

ROUTES = 40
MIN_KM = 250
RULE = (f"As {ROUTES} maiores ligações aéreas de passageiros entre cidades do mapa a pelo menos {MIN_KM} km uma da "
        "outra, somando os dois sentidos e todos os aeroportos de cada cidade (ANAC, Dados Estatísticos).")
PATH_NOTE = "O arco liga os estandartes das duas cidades: é um desenho, não a rota do voo."


def air_routes(pairs: dict[str, float], city_of_airport: dict[str, str], cities: dict[str, dict]) -> list[dict]:
    """Airport-pair passengers → the ROUTES largest city pairs at least MIN_KM apart (both ways, every airport)."""
    pax = defaultdict(float)
    for key, n in pairs.items():
        a, b = key.split("-")
        ca, cb = city_of_airport.get(a), city_of_airport.get(b)
        if not ca or not cb or ca == cb:
            continue
        pax[tuple(sorted((ca, cb)))] += n
    routes = []
    for (a, b), n in sorted(pax.items(), key=lambda kv: -kv[1]):
        A, B = cities[a], cities[b]
        dist = math.dist((A["x"], A["y"]), (B["x"], B["y"]))
        if dist < MIN_KM:
            continue
        routes.append({"a": a, "b": b, "rank": len(routes) + 1, "pax": round(n), "value_musd": round(n),
                       "modes": {"air": 1.0}, "top_mode": "air", "top_commodity": None, "dist_km": round(dist),
                       "path": [A["cell"], B["cell"]]})
        if len(routes) >= ROUTES:
            break
    return routes


def build() -> None:
    anac = load_interim_payload("anac")["data"]
    infra = json.loads((WEB_DATA / "infrastructure.json").read_text())
    cities = {c["id"]: c for c in json.loads((WEB_DATA / "cities.json").read_text())}
    city_of_airport = {a["id"]: a["cbsa"] for a in infra["airports"] if a.get("cbsa")}
    routes = air_routes(anac["routes"], city_of_airport, cities)
    used = {c for r in routes for c in (r["a"], r["b"])}
    zones = [{"id": cid, "name": cities[cid]["full"], "short": cities[cid]["name"], "kind": "metro",
              "states": cities[cid]["states"], "cities": [cid],
              "anchor": {"cell": cities[cid]["cell"], "x": cities[cid]["x"], "y": cities[cid]["y"], "city": cid}}
             for cid in sorted(used)]
    write_web("trade.json", {
        "version": 1, "vintage": f"ANAC, {anac['year']}", "year": anac["year"], "sources": ["anac"],
        "rule": RULE, "path_note": PATH_NOTE, "units": {"pax": "passageiros por ano, nos dois sentidos"},
        "modes": [{"id": "air", "name": "Aéreo"}], "commodities": {}, "zones": zones, "routes": routes,
    })
    print(f"    {len(routes)} air routes between {len(zones)} cities; top: "
          + ", ".join(f"{cities[r['a']]['name']}–{cities[r['b']]['name']} {r['pax'] / 1e6:.1f} mi" for r in routes[:3]))


def check(web_dir: Path) -> list[tuple[str, str]]:
    p = Path(web_dir) / "trade.json"
    if not p.exists():
        return [("NOTE", "trade.json: missing (optional, skipped)")]
    doc = json.loads(p.read_text())
    bad = [r for r in doc.get("routes", []) if r.get("pax") is None or r.get("a") == r.get("b")]
    if bad:
        return [("FAIL", f"trade.json: {len(bad)} routes without passengers or with one city at both ends")]
    return [("PASS", f"trade.json: {len(doc.get('routes', []))} air routes")]
