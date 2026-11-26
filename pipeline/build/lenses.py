"""Lentes: recolorem o mapa por uma medida dos municípios (Censo 2022, PIB) ou da cobertura do solo.

Cada hexágono é amostrado em 7 pontos (world.py). A população de um município é espalhada pelos hexágonos na
proporção de quantos dos seus pontos de amostra caem em cada um, então cada pessoa é contada uma vez só. Um
município pequeno que nenhum ponto acerta entra inteiro no hexágono da sua sede. Densidade = pessoas ÷ a área de terra
do hexágono; toda outra lente é a média dos municípios do hexágono, ponderada por essas pessoas.
"""

from __future__ import annotations

import json
import math
from collections import Counter
from pathlib import Path

from ..core.geo import MapProjection
from ..core.hexgrid import HexGrid
from ..core.store import load_interim, write_web
from .cities import nearest_land

REQUIRES = ["_world", "ibge_census", "ibge_censo2022", "ibge_gdp", "ibge_localities"]
PRODUCES = ["lenses.json"]

GROUPS = [
    {"id": "people", "name": "Pessoas"},
    {"id": "prosperity", "name": "Prosperidade"},
    {"id": "knowledge", "name": "Conhecimento"},
    {"id": "life", "name": "Vida diária"},
    {"id": "land", "name": "Terra"},
]
DOMAIN_NOTE = " As cores vão do 2º ao 98º percentil dos hexágonos; valores além disso ficam nas cores das pontas."


def nice(v: float, up: bool) -> float:
    """v rounded outward (up or down) to 2 significant digits."""
    if v == 0:
        return 0
    mag = 10 ** (math.floor(math.log10(abs(v))) - 1)
    return round((math.ceil if up else math.floor)(v / mag) * mag, 10)


def percentile_domain(values: list, log: bool) -> list[float] | None:
    """[2nd, 98th] percentile of the non-null hex values, rounded outward; positive values only on a log scale."""
    vals = sorted(v for v in values if v is not None and (v > 0 or not log))
    if not vals:
        return None
    lo, hi = vals[int(0.02 * (len(vals) - 1))], vals[int(0.98 * (len(vals) - 1))]
    lo, hi = nice(lo, False), nice(hi, True)
    if hi <= lo:
        hi = lo + (abs(lo) or 1)
    return [lo, hi]


def ratio(a, b):
    return None if a is None or not b else a / b


RAMPS = {
    "warm": ["#1b1035", "#4b2377", "#9a3b8a", "#e0645e", "#f9b24a", "#fff3a8"],
    "gold": ["#3a1c0b", "#7a4413", "#b8781f", "#e3b23c", "#f6e27f", "#fffbe0"],
    "blue": ["#0b1a33", "#123a6b", "#1f63a3", "#3c90cc", "#86c0e6", "#dff0fb"],
    "teal": ["#062421", "#0d4a43", "#147266", "#2a9c8a", "#71c7b2", "#d4f1e8"],
    "red": ["#2b0a0a", "#5c1414", "#8e2323", "#c24234", "#e88a68", "#fbd9c4"],
    "forest": ["#0b1f0f", "#14401c", "#1f6b2b", "#3a9443", "#7fc07a", "#d5efcd"],
    "farm": ["#141d05", "#2f4510", "#557019", "#84a02a", "#b8cf55", "#eef7b8"],
    "grey": ["#121218", "#2c2c3c", "#4b4b66", "#727294", "#a3a3c2", "#e2e2f0"],
}

# id → (municipal value from (censo, pop, gdp, code), lens metadata)
MUNICIPAL_LENSES = {
    "age": (lambda c, p, g, m: c["median_age"].get(m), {
        "group": "people", "name": "Idade mediana", "icon": "l-age", "unit": "anos", "format": "years", "scale": "linear",
        "higher_is": "neutral", "ramp": RAMPS["blue"],
        "description": "Idade mediana dos moradores (Censo 2022, tabela 9515), média dos municípios do hexágono "
        "ponderada pela população."}),
    "ageing": (lambda c, p, g, m: c["ageing_index"].get(m), {
        "group": "people", "name": "Envelhecimento", "icon": "l-age", "unit": "idosos por 100 jovens", "format": "float",
        "scale": "linear", "higher_is": "neutral", "ramp": RAMPS["warm"],
        "description": "Índice de envelhecimento: pessoas de 65 anos ou mais para cada 100 de até 14 anos (Censo 2022)."}),
    "income": (lambda c, p, g, m: ratio(c["earnings_total"].get(m), c["employed"].get(m)), {
        "group": "prosperity", "name": "Renda do trabalho", "icon": "l-income", "unit": "R$ por mês, por ocupado",
        "format": "usd", "scale": "linear", "higher_is": "good", "ramp": RAMPS["gold"],
        "description": "Rendimento médio mensal de todos os trabalhos por pessoa ocupada: a massa de rendimento ÷ os "
        "ocupados (Censo 2022, tabelas 10289 e 9517)."}),
    "gdp_pc": (lambda c, p, g, m: ratio(g.get(m), p.get(m)), {
        "group": "prosperity", "name": "PIB por habitante", "icon": "l-income", "unit": "R$ por habitante por ano",
        "format": "usd", "scale": "log", "higher_is": "good", "ramp": RAMPS["gold"],
        "description": "PIB de 2023 ÷ população do Censo 2022, por município (IBGE)."}),
    "unemployment": (lambda c, p, g, m: ratio(c["unemployed"].get(m), c["labour_force"].get(m)), {
        "group": "prosperity", "name": "Desocupação", "icon": "unemployment", "unit": "desocupados ÷ força de trabalho",
        "format": "pct", "scale": "linear", "higher_is": "bad", "ramp": RAMPS["red"],
        "description": "Pessoas de 14 anos ou mais desocupadas ÷ a força de trabalho, na semana de referência do Censo "
        "2022 (tabela 9517)."}),
    "literacy": (lambda c, p, g, m: None if c["literacy"].get(m) is None else c["literacy"][m] / 100, {
        "group": "knowledge", "name": "Alfabetização", "icon": "l-degrees", "unit": "das pessoas de 15 anos ou mais",
        "format": "pct", "scale": "linear", "higher_is": "good", "ramp": RAMPS["teal"],
        "description": "Taxa de alfabetização das pessoas de 15 anos ou mais (Censo 2022, tabela 9543)."}),
    "degrees": (lambda c, p, g, m: ratio(c["adults25_degree"].get(m), c["adults25"].get(m)), {
        "group": "knowledge", "name": "Ensino superior", "icon": "l-degrees", "unit": "dos adultos de 25 anos ou mais",
        "format": "pct", "scale": "linear", "higher_is": "good", "ramp": RAMPS["blue"],
        "description": "Adultos de 25 anos ou mais com superior completo (Censo 2022, tabela 10061)."}),
    "sewer": (lambda c, p, g, m: ratio(c["households_sewer"].get(m), c["households"].get(m)), {
        "group": "life", "name": "Esgoto na rede", "icon": "l-homeownership", "unit": "dos domicílios",
        "format": "pct", "scale": "linear", "higher_is": "good", "ramp": RAMPS["teal"],
        "description": "Domicílios ligados à rede geral de esgoto ou pluvial (Censo 2022, tabela 6805).",
        "note": "Fossa séptica ligada à rede conta à parte e não entra aqui."}),
    "water": (lambda c, p, g, m: ratio(c["households_water"].get(m), c["households"].get(m)), {
        "group": "life", "name": "Água da rede", "icon": "l-home", "unit": "dos domicílios",
        "format": "pct", "scale": "linear", "higher_is": "good", "ramp": RAMPS["blue"],
        "description": "Domicílios ligados à rede geral de água e que a usam como forma principal (Censo 2022, tabela 6803)."}),
}

LAND_LENSES = {
    "forest": (["forest"], {"name": "Floresta", "icon": "l-forest", "ramp": RAMPS["forest"],
                            "description": "Parcela da terra do hexágono coberta por floresta (ESA WorldCover 2021)."}),
    "farmland": (["crop"], {"name": "Lavoura", "icon": "l-farmland", "ramp": RAMPS["farm"],
                            "description": "Parcela da terra do hexágono em lavoura (ESA WorldCover 2021).",
                            "note": "O WorldCover não separa pasto de campo: pastagens não entram aqui."}),
    "developed": (["developed"], {"name": "Área construída", "icon": "l-developed", "ramp": RAMPS["grey"],
                                  "description": "Parcela da terra do hexágono com área construída (ESA WorldCover 2021)."}),
}


def build() -> None:
    world = load_interim("_world")
    pop = load_interim("ibge_census")["municipalities"]
    censo = load_interim("ibge_censo2022")["municipalities"]
    gdp = load_interim("ibge_gdp")["municipalities"]
    seats = load_interim("ibge_localities")["seats"]
    proj = MapProjection(**world["projection"])
    grid = HexGrid(**world["grid"])
    samples = world["county_samples"]
    geoids = world["counties"]
    hex_area = 1.5 * math.sqrt(3) * grid.radius ** 2
    total_hits = Counter(k for s in samples for k in s if k >= 0)

    # municipalities no sample hits go to their seat's hex
    small_by_cell: dict[int, list[int]] = {}
    for k, m in enumerate(geoids):
        if total_hits[k] or not pop.get(m):
            continue
        s = seats.get(m)
        if not s:
            continue
        x, y = proj(s["lon"], s["lat"])
        cell = grid.cell_at(x, y)
        if cell < 0 or not samples[cell]:  # a coastal seat in a sea hex (Recife, Maceió, Natal): nearest land hex
            cell = nearest_land(grid, world["owner"], max(cell, 0), x, y, -1)
        if cell >= 0 and samples[cell]:
            small_by_cell.setdefault(cell, []).append(k)

    weights: list[list[tuple[int, float]]] = [[] for _ in range(grid.size)]
    density = [None] * grid.size
    for i, s in enumerate(samples):
        if not s:
            continue
        parts = [(k, pop[geoids[k]] * hits / total_hits[k]) for k, hits in Counter(x for x in s if x >= 0).items()
                 if pop.get(geoids[k])]
        parts += [(k, pop[geoids[k]]) for k in small_by_cell.get(i, [])]
        land = sum(1 for x in s if x >= 0) or 1
        weights[i] = parts
        if parts:
            density[i] = round(sum(p for _, p in parts) / (hex_area * land / len(s)), 2)
    on_hexes = sum(p for parts in weights for _, p in parts)
    print(f"    population on hexes {on_hexes:,.0f} of {sum(v for v in pop.values() if v):,.0f}")

    lenses = [{
        "id": "density", "group": "people", "name": "Densidade", "icon": "l-people", "unit": "habitantes / km²",
        "format": "int", "scale": "log", "ramp": RAMPS["warm"], "higher_is": "neutral", "source": "ibge_census",
        "description": "Moradores por km² de terra. A população de cada município (Censo 2022) é espalhada pelos seus "
        "hexágonos na proporção de quanto do município cada hexágono cobre.",
        "values": density,
    }]
    for lid, (f, meta) in MUNICIPAL_LENSES.items():
        mval = [f(censo, pop, gdp, m) for m in geoids]
        values = [None] * grid.size
        for i, parts in enumerate(weights):
            vals = [(mval[k], p) for k, p in parts if mval[k] is not None]
            wsum = sum(p for _, p in vals)
            if wsum:
                v = sum(v * p for v, p in vals) / wsum
                values[i] = round(v, 4) if meta["format"] == "pct" else round(v, 1 if v < 1000 else 0)
        lenses.append({"id": lid, **meta, "source": "ibge_gdp" if lid == "gdp_pc" else "ibge_censo2022", "values": values})

    pct, owner = world.get("pct"), world["owner"]
    cover = world.get("cover") or [1] * grid.size
    for lid, (keys, meta) in LAND_LENSES.items():
        values = [round(sum(pct[k][i] for k in keys) / 100, 2) if owner[i] >= 0 and cover[i] else None
                  for i in range(grid.size)]
        lenses.append({"id": lid, "group": "land", **meta, "unit": "da terra", "format": "pct", "scale": "linear",
                       "higher_is": "neutral", "source": "worldcover", "values": values})

    for lens in lenses:
        lens["domain"] = percentile_domain(lens["values"], lens["scale"] == "log")
        lens["description"] += DOMAIN_NOTE
    groups = [g for g in GROUPS if any(l["group"] == g["id"] for l in lenses)]
    write_web("lenses.json", {"vintage": "Censo 2022", "groups": groups, "lenses": lenses})
    print(f"    {len(lenses)} lenses: " + ", ".join(l["id"] for l in lenses))


def check(web_dir) -> list[tuple[str, str]]:
    path = Path(web_dir) / "lenses.json"
    if not path.exists():
        return [("NOTE", "lenses.json missing (pipeline.check reports it)")]
    out = []
    for lens in json.loads(path.read_text()).get("lenses", []):
        nums = sorted(v for v in lens.get("values") or [] if v is not None)
        if nums:
            out.append(("PASS", f"lens {lens['id']}: {len(nums)} hexes, median {nums[len(nums) // 2]}, "
                                f"range {nums[0]}…{nums[-1]}"))
    return out
