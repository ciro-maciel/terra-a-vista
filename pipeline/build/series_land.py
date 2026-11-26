"""Série da terra (MapBiomas): quanto de cada município é vegetação nativa, pasto, agricultura, soja e cidade, de
cinco em cinco anos desde 1985, para a linha do tempo e o "por quê"."""

from __future__ import annotations

from ..core.store import load_interim
from .series_util import build_series, check_series

REQUIRES = ["mapbiomas", "_world", "ibge_boundaries", "cities.json"]
PRODUCES = ["series_land.json"]

RULE = ("Parcela da área de cada município em cada classe do MapBiomas (Coleção 11, imagens Landsat de 30 m), de cinco "
        "em cinco anos. Uma cidade e um estado somam as áreas dos seus municípios. Vegetação nativa é tudo o que o "
        "MapBiomas chama de natural: floresta, savana, campo, mangue, área alagada. A cor de cada medida usa a mesma "
        "escala em todos os anos.")

METRICS = [
    ("natural", "Vegetação nativa", ["#f1e6b8", "#d2c27a", "#a3b35a", "#629848", "#2d6f36", "#0f4524"], "good", "Floresta, cerrado, caatinga, campo, mangue e áreas alagadas naturais."),
    ("pasture", "Pasto", "gold", "neutral", "Pastagem plantada ou natural usada pelo gado."),
    ("agriculture", "Agricultura", "farm", "neutral", "Lavouras temporárias e perenes: soja, milho, cana, café, citros e outras."),
    ("soy", "Soja", "farm", "neutral", "Área de soja (a classe do MapBiomas)."),
    ("urban", "Cidade", "grey", "neutral", "Área urbanizada: ruas, casas, prédios e indústrias."),
]


def zero_filled(group: dict, area: dict) -> dict:
    """A class the municipality never had is 0 ha, not unknown (else it drops out of every sum)."""
    return {c: {y: group.get(c, {}).get(y, 0.0) for y in a} for c, a in area.items()}


def build() -> None:
    mb = load_interim("mapbiomas")
    last = int(mb["years"][-1])
    years = [str(y) for y in range(int(mb["years"][0]), last + 1, 5)]
    if years[-1] != str(last):
        years.append(str(last))
    area = mb["area_ha"]
    build_series(
        {"id": "land", "name": "Terra", "vintage": mb.get("vintage") or "MapBiomas Coleção 11", "sources": ["mapbiomas"],
         "years": years, "rule": RULE, "question": "O que aconteceu com a terra desde {first}?"},
        [{"id": k, "name": n, "unit": "da área", "format": "pct", "ramp": ramp, "higher_is": hi,
          "description": d, "num": zero_filled(mb["groups"][k], area), "den": area, "lo_floor": 0} for k, n, ramp, hi, d in METRICS],
    )


def check(web_dir):
    return check_series(web_dir, "land")
