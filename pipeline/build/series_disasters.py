"""Série dos desastres (Atlas Digital de Desastres): quantas vezes cada município registrou seca, chuva forte,
deslizamento e vendaval, e quantas pessoas morreram ou perderam a casa, em períodos de cinco anos desde 1991."""

from __future__ import annotations

from ..core.store import load_interim
from .series_util import build_series, check_series

REQUIRES = ["atlas_desastres", "ibge_census", "_world", "ibge_boundaries", "cities.json"]
PRODUCES = ["series_disasters.json"]
PERIODS = [(y - 4, y) for y in range(1995, 2026, 5)]  # 1991–1995 … 2021–2025, labelled by the last year

RULE = ("Desastres que o município registrou na Defesa Civil em cada período de cinco anos (o ano no botão é o último "
        "do período), e as pessoas que ele declarou mortas, desabrigadas ou desalojadas. Um registro é o município "
        "declarando o desastre, não uma medida do clima: desde 2013 o registro é digital (S2iD), e parte da alta depois "
        "disso é registro mais fácil. Cidades e estados mostram a média de registros por município, e as pessoas por "
        "habitante do Censo 2022.")


def by_period(years: dict) -> dict[str, float]:
    return {str(b): float(sum(v for y, v in years.items() if a <= int(y) <= b)) for a, b in PERIODS}


def build() -> None:
    at = load_interim("atlas_desastres")
    pop = load_interim("ibge_census")["municipalities"]
    world = load_interim("_world")
    codes = [c for c in world["counties"] if pop.get(c)]
    m = at["municipalities"]
    ys = [str(b) for _, b in PERIODS]
    count = lambda key: {c: by_period(m.get(c, {}).get(key, {})) for c in codes}
    one = {c: {y: 1.0 for y in ys} for c in codes}
    per = lambda k: {c: {y: pop[c] / k for y in ys} for c in codes}
    metrics = [
        {"id": "drought", "name": "Seca", "unit": "registros por município no período", "format": "float", "ramp": "gold",
         "higher_is": "bad", "lo_floor": 0, "description": "Estiagem e seca.", "num": count("drought"), "den": one},
        {"id": "rain", "name": "Chuva forte", "unit": "registros por município no período", "format": "float", "ramp": "blue",
         "higher_is": "bad", "lo_floor": 0, "description": "Enxurradas, inundações, alagamentos e chuvas intensas.",
         "num": count("rain"), "den": one},
        {"id": "landslide", "name": "Deslizamento", "unit": "registros por município no período", "format": "float",
         "ramp": "red", "higher_is": "bad", "lo_floor": 0, "description": "Movimentos de massa e erosão.",
         "num": count("landslide"), "den": one},
        {"id": "homeless", "name": "Sem casa", "unit": "desabrigados e desalojados por mil habitantes", "format": "float",
         "ramp": "warm", "higher_is": "bad", "lo_floor": 0,
         "description": "Pessoas que perderam a casa (desabrigadas) ou tiveram de sair dela por um tempo (desalojadas).",
         "num": count("homeless"), "den": per(1000)},
        {"id": "dead", "name": "Mortes", "unit": "por 100 mil habitantes no período", "format": "float", "ramp": "red",
         "higher_is": "bad", "lo_floor": 0, "description": "Mortos declarados nos desastres.",
         "num": count("dead"), "den": per(100000)},
    ]
    build_series({"id": "disasters", "name": "Desastres", "vintage": at.get("vintage") or "Atlas Digital de Desastres",
                  "sources": ["atlas_desastres"], "years": ys, "rule": RULE, "fixed_borders": True,
                  "question": "Que desastres aconteceram aqui de 1991 a 2025?", "events": at.get("deadliest", [])}, metrics)


def check(web_dir):
    return check_series(web_dir, "disasters")
