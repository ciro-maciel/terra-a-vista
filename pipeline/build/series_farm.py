"""Série da lavoura e do gado (IBGE PAM e PPM): quanto da área de cada município foi colhido de lavoura, de soja,
milho, cana e café, e quantos bois por km², de cinco em cinco anos desde 1975."""

from __future__ import annotations

from ..core.store import load_interim
from .series_util import build_series, check_series

REQUIRES = ["ibge_agro_history", "ibge_censo2022", "_world", "ibge_boundaries", "cities.json"]
PRODUCES = ["series_farm.json"]

RULE = ("Área colhida no ano ÷ a área do município (Censo 2022), e bois por km², de cinco em cinco anos (IBGE, Produção "
        "Agrícola e Pecuária Municipal). Uma área colhida duas vezes no ano (soja e depois milho safrinha) conta duas "
        "vezes, então a soma das lavouras pode passar da área de lavoura do MapBiomas. Um município criado depois não tem "
        "valor nos anos em que ainda não existia: as roças dele contavam no município de onde saiu, que nesses anos "
        "aparece com a parcela exagerada; por isso quem mais mudou compara cada ano com o de cinco anos antes. Uma lavoura "
        "que passa da área do município fica sem valor naquele ano. Cidades, estados e o Brasil somam tudo e não sofrem disso.")

SHARES = [
    ("crops", "Lavouras", "farm", "Todas as lavouras, temporárias e permanentes."),
    ("soy", "Soja", "farm", "Soja em grão."),
    ("corn", "Milho", "gold", "Milho em grão, primeira e segunda safra."),
    ("sugarcane", "Cana", "teal", "Cana-de-açúcar."),
    ("coffee", "Café", "red", "Café em grão (arábica e canéfora)."),
]


def plausible(crop: dict, area_ha: dict, cap: float) -> dict:
    """Drop a year where one crop covers more than `cap` × the municipality: a source error or a border mismatch."""
    return {c: {y: (None if v is not None and area_ha.get(c) and v > cap * area_ha[c] else v) for y, v in ys.items()}
            for c, ys in crop.items()}


def build() -> None:
    h = load_interim("ibge_agro_history")
    area_km2 = load_interim("ibge_censo2022")["municipalities"]["area_km2"]
    years = h["years"]
    ha = {c: {y: a * 100 for y in years} for c, a in area_km2.items() if a}
    km2 = {c: {y: a for y in years} for c, a in area_km2.items() if a}
    zero = lambda d: {c: {y: (d.get(c) or {}).get(y) or 0.0 for y in years} for c in area_km2}
    area_ha = {c: a * 100 for c, a in area_km2.items() if a}
    # one crop can't cover more than the municipality; every crop together can, harvested twice a year
    clean = {k: plausible(h[k], area_ha, 2.0 if k == "crops" else 1.0) for k, *_ in SHARES}
    metrics = [{"id": k, "name": n, "unit": "da área do município, colhida", "format": "pct", "ramp": ramp,
                "description": d, "num": clean[k], "agg_num": zero(h[k]), "den": ha, "lo_floor": 0}
               for k, n, ramp, d in SHARES]
    metrics.append({"id": "cattle", "name": "Gado", "unit": "bois por km²", "format": "int", "ramp": "warm",
                    "description": "Rebanho bovino em 31 de dezembro ÷ a área do município.",
                    "num": h["cattle"], "agg_num": zero(h["cattle"]), "den": km2, "lo_floor": 0})
    build_series({"id": "farm", "name": "Lavoura", "vintage": h.get("vintage") or "PAM e PPM",
                  "sources": ["ibge_agro_history"], "years": years, "rule": RULE,
                  "question": "Como a lavoura e o gado mudaram desde {first}?",
                  "fixed_borders": False, "stable_from": 2005}, metrics)


def check(web_dir):
    return check_series(web_dir, "farm", min_munis=4000)
