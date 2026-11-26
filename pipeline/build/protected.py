"""Áreas protegidas: quais hexágonos as terras indígenas e as unidades de conservação cobrem.

Cada hexágono é testado em 19 pontos (o centro, 6 a meio raio e 12 perto da borda). Uma área "toca" um hexágono
quando cobre pelo menos 3 desses pontos; um tipo (terra indígena, proteção integral, uso sustentável) "cobre" o
hexágono quando a união das suas áreas cobre pelo menos metade dos pontos. Uma área menor que isso fica marcada no
hexágono do seu centro, para que ninguém suma do mapa.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

from ..core.geo import MapProjection, Shape, geojson_rings
from ..core.hexgrid import HexGrid
from ..core.store import load_interim, write_web

REQUIRES = ["protected_areas", "_world", "ibge_boundaries"]
PRODUCES = ["protected.json"]

KINDS = [
    {"id": "ti", "name": "Terra indígena", "color": "#d9823b",
     "rule": "Terras indígenas reconhecidas pela Funai, em qualquer fase: em estudo, delimitada, declarada, homologada ou regularizada."},
    {"id": "pi", "name": "Proteção integral", "color": "#2f8f5b",
     "rule": "Unidades de conservação de proteção integral (parques, estações ecológicas, reservas biológicas, monumentos naturais, refúgios): não se mora nem se explora, só pesquisa e visita."},
    {"id": "us", "name": "Uso sustentável", "color": "#8fb04e",
     "rule": "Unidades de conservação de uso sustentável (áreas de proteção ambiental, florestas nacionais, reservas extrativistas e outras): pode-se morar e produzir com regras. As áreas de proteção ambiental (APA) são as mais frouxas e podem incluir cidades."},
]
TOUCH, COVER = 3, 0.5


def sample_offsets(radius: float) -> list[tuple[float, float]]:
    pts = [(0.0, 0.0)]
    for k in range(6):
        a = math.pi / 3 * k + math.pi / 6
        pts.append((0.5 * radius * math.cos(a), 0.5 * radius * math.sin(a)))
    for k in range(12):
        a = math.pi / 6 * k
        pts.append((0.82 * radius * math.cos(a), 0.82 * radius * math.sin(a)))
    return pts


def kind_of(layer: str, props: dict) -> str:
    if layer == "ti":
        return "ti"
    return "pi" if "integral" in str(props.get("grupo", "")).lower() else "us"


def build() -> None:
    pa = load_interim("protected_areas")
    world = load_interim("_world")
    proj = MapProjection(**world["projection"])
    grid = HexGrid(**world["grid"])
    owner = world["owner"]
    abbr_of = {s["fips"]: s["abbr"] for s in load_interim("ibge_boundaries")["states"]}
    state_abbr = [abbr_of.get(f) for f in world["states"]]
    offs = sample_offsets(grid.radius)
    n = len(offs)
    hits = {k["id"]: {} for k in KINDS}  # kind → cell → set of sample indices covered by any area of that kind
    areas = []
    for layer in ("ti", "uc"):
        for f in pa[layer]:
            p = f["props"]
            rings = [[proj(lon, lat) for lon, lat in r] for r in geojson_rings(f["geometry"])]
            shape = Shape(rings)
            if not shape.rings:
                continue
            k = kind_of(layer, p)
            x0, y0, x1, y1 = shape.bbox
            cells = []
            r = grid.radius
            c0, c1 = max(0, int(x0 // (math.sqrt(3) * r)) - 1), min(grid.cols - 1, int(x1 // (math.sqrt(3) * r)) + 1)
            r0, r1 = max(0, int(y0 // (1.5 * r)) - 1), min(grid.rows - 1, int(y1 // (1.5 * r)) + 1)
            for row in range(r0, r1 + 1):
                for col in range(c0, c1 + 1):
                    i = grid.index(col, row)
                    if owner[i] < 0:
                        continue
                    cx, cy = grid.center(col, row)
                    inside = {j for j, (dx, dy) in enumerate(offs) if shape.contains(cx + dx, cy + dy)}
                    if inside:
                        hits[k].setdefault(i, set()).update(inside)
                    if len(inside) >= TOUCH:
                        cells.append(i)
            mx, my = (x0 + x1) / 2, (y0 + y1) / 2
            if not cells:
                c = grid.cell_at(mx, my)
                if c >= 0 and owner[c] >= 0:
                    cells = [c]
            if layer == "ti":
                name, sub = p.get("terrai_nome"), " · ".join(x for x in [p.get("etnia_nome"), p.get("fase_ti")] if x)
                ha = p.get("superficie_perimetro_ha")
            else:
                name, sub = str(p.get("nome_uc") or "").title(), " · ".join(x for x in [p.get("categoria"), p.get("esfera")] if x)
                ha = float(p["ha_total"]) if str(p.get("ha_total") or "").replace(".", "", 1).isdigit() else None
            areas.append({"k": k, "n": name, "s": sub, "ha": round(ha) if ha else None, "x": round(mx, 1), "y": round(my, 1),
                          "cells": cells})
    covered = {k: sorted(i for i, s in d.items() if len(s) >= COVER * n) for k, d in hits.items()}
    # each state's land hexes and how many of them each kind covers
    land: dict[str, int] = {}
    for i, o in enumerate(owner):
        if o >= 0 and state_abbr[o]:
            land[state_abbr[o]] = land.get(state_abbr[o], 0) + 1
    states = {}
    for k, cells in covered.items():
        for i in cells:
            a = state_abbr[owner[i]]
            if a:
                states.setdefault(a, {}).setdefault(k, 0)
                states[a][k] += 1
    any_cover = set().union(*covered.values())
    for i in any_cover:
        a = state_abbr[owner[i]]
        if a:
            states.setdefault(a, {}).setdefault("any", 0)
            states[a]["any"] += 1
    total_land = sum(land.values())
    write_web("protected.json", {
        "version": 1, "vintage": pa.get("vintage"), "sources": ["protected_areas"],
        "rule": "Um tipo cobre um hexágono quando as suas áreas cobrem pelo menos metade dele (19 pontos testados). Uma "
                "terra indígena e uma unidade de conservação podem se sobrepor. As contas por estado contam hexágonos, "
                "uma aproximação da área.",
        "kinds": KINDS, "cells": covered, "areas": areas,
        "states": {a: {"land": land[a], **v} for a, v in states.items()},
        "nation": {"land": total_land, **{k: len(v) for k, v in covered.items()}, "any": len(any_cover)},
    })
    print(f"    {len(areas)} areas; hexes covered: " + ", ".join(f"{k} {len(v)}" for k, v in covered.items())
          + f", any {len(any_cover)} of {total_land} land hexes")


def check(web_dir) -> list[tuple[str, str]]:
    p = Path(web_dir) / "protected.json"
    if not p.exists():
        return [("NOTE", "protected.json: missing (optional, skipped)")]
    d = json.loads(p.read_text())
    lost = sum(1 for a in d["areas"] if not a["cells"])
    if lost > 0.05 * len(d["areas"]):
        return [("FAIL", f"protected.json: {lost} of {len(d['areas'])} areas fall in no hex")]
    return [("PASS", f"protected.json: {len(d['areas'])} areas, {d['nation']['any']} of {d['nation']['land']} land hexes covered")]
