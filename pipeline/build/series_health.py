"""Série da saúde (Datasus): mortalidade infantil desde 2000, médicos e leitos por mil habitantes desde 2010."""

from __future__ import annotations

from ..core.store import load_interim
from .series_util import build_series, check_series

REQUIRES = ["datasus", "ibge_history", "ibge_census", "_world", "ibge_boundaries", "cities.json"]
PRODUCES = ["series_health.json"]
YEARS = ["2000", "2005", "2010", "2015", "2020", "2024"]

RULE = ("Mortalidade infantil: óbitos de menores de 1 ano por mil nascidos vivos, pelo município de residência da mãe, "
        "somando três anos em volta de cada ano (2024 usa 2022 a 2024) para que um município pequeno não salte de um ano "
        "para o outro (Ministério da Saúde, SIM e Sinasc). É a conta direta dos registros: no Norte e no Nordeste do "
        "começo da série faltavam registros, e a taxa real era maior. Médicos e leitos: o que o Cadastro Nacional de "
        "Estabelecimentos de Saúde registra em dezembro, por mil habitantes; um médico que trabalha em dois municípios "
        "conta nos dois, e os leitos são os de internação existentes, do SUS e fora dele.")


def window(counts: dict, year: str, have: list[str]) -> float | None:
    """Sum of the three years around `year` that exist in `have` (the last year sums itself and the two before)."""
    y = int(year)
    span = [str(x) for x in ((y - 2, y - 1, y) if str(y + 1) not in have else (y - 1, y, y + 1))]
    vals = [counts.get(s) for s in span if s in have]
    return None if not vals or any(v is None for v in vals) else sum(vals)


def build() -> None:
    ds = load_interim("datasus")
    world = load_interim("_world")
    full = {c[:6]: c for c in world["counties"]}
    to7 = lambda d: {full[k]: v for k, v in d.items() if k in full}
    deaths, births = to7(ds["deaths"]), to7(ds["births"])
    have = ds["death_years"]
    d_num = {c: {y: window(deaths.get(c, {}), y, have) or 0.0 for y in YEARS} for c in births}
    b_den = {c: {y: (window(births[c], y, have) or 0) / 1000 or None for y in YEARS} for c in births}

    hist = load_interim("ibge_history")["municipalities"]["population"]
    pop22 = load_interim("ibge_census")["municipalities"]
    pop = {c: {"2010": (hist.get(c) or {}).get("2010"), **(ds["population"].get(c) or {})}  # SIDRA codes are already 7 digits
           for c in world["counties"]}
    for c in pop:
        pop[c].setdefault("2024", pop22.get(c))
    per_k = {c: {y: (v / 1000 if v else None) for y, v in ys.items()} for c, ys in pop.items()}
    cnes = lambda key: {c: {y: (to7(ds[key]).get(c) or {}).get(y, 0.0) if y in ds["cnes_years"] else None for y in YEARS}
                        for c in world["counties"]}
    build_series(
        {"id": "health", "name": "Saúde", "vintage": ds.get("vintage") or "Datasus", "sources": ["datasus"],
         "years": YEARS, "rule": RULE, "question": "Como a saúde mudou desde {first}?", "fixed_borders": False,
         "stable_from": 2005, "compare_from": 2010, "movers_min_pop": 20000},
        [
            {"id": "infant", "name": "Mortalidade infantil", "unit": "óbitos por mil nascidos vivos", "format": "float",
             "ramp": "red", "higher_is": "bad", "lo_floor": 0,
             "description": "Óbitos de menores de 1 ano por mil nascidos vivos, três anos somados.",
             "num": d_num, "den": b_den},
            {"id": "doctors", "name": "Médicos", "unit": "por mil habitantes", "format": "float", "ramp": "teal",
             "higher_is": "good", "lo_floor": 0, "description": "Médicos registrados no CNES em dezembro, por mil habitantes.",
             "num": cnes("doctors"), "den": per_k},
            {"id": "beds", "name": "Leitos", "unit": "por mil habitantes", "format": "float", "ramp": "blue",
             "higher_is": "good", "lo_floor": 0, "description": "Leitos de internação existentes (SUS e não SUS), por mil habitantes.",
             "num": cnes("beds"), "den": per_k},
        ])


def check(web_dir):
    return check_series(web_dir, "health")
