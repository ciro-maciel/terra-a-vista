"""Maravilhas: os sítios brasileiros do Patrimônio Mundial da UNESCO.

A regra é a da própria UNESCO: todo sítio inscrito entra. Um sítio com vários pontos (as Missões, as Reservas da
Mata Atlântica) aparece no primeiro ponto que cai em terra brasileira. Os naturais são maravilhas naturais; os
culturais e mistos, marcos. A ordem é a do ano de inscrição.
"""

from __future__ import annotations

import json
from pathlib import Path

from ..core.paths import WEB_DATA
from ..core.store import load_interim, load_interim_payload, write_web

REQUIRES = ["_world", "unesco_whc", "ibge_boundaries", "cities.json"]
PRODUCES = ["wonders.json"]

KIND = {"natural": "natural", "cultural": "landmark", "misto": "landmark"}
RULE_TEXT = ("Todos os sítios brasileiros inscritos na Lista do Patrimônio Mundial da UNESCO, em ordem de inscrição. "
             "Um sítio com vários pontos aparece no primeiro que cai em terra brasileira.")


def build() -> None:
    from .infrastructure import Locator  # same placement as ports and airports
    from ..core.geo import MapProjection
    from ..core.hexgrid import HexGrid

    world = load_interim("_world")
    loc = Locator(world, HexGrid(**world["grid"]), MapProjection(**world["projection"]))
    payload = load_interim_payload("unesco_whc")
    sites = sorted(payload["data"]["sites"], key=lambda s: (s["inscribed"], s["id"]))
    wonders, missing = [], []
    for s in sites:
        at = next((a for a in (loc.place(lon, lat) for lon, lat in s["points"]) if a), None)
        if at is None and s["points"]:  # an island smaller than a hex (Fernando de Noronha): its sea hex
            x, y = loc.proj(*s["points"][-1])
            cell = loc.grid.cell_at(x, y)
            if cell is not None and cell >= 0:
                at = {"x": round(x, 1), "y": round(y, 1), "cell": cell, "county": None, "cbsa": None, "state": None}
        if at is None:
            missing.append(s["name"])
            continue
        wonders.append({
            "id": f"whc-{s['id']}", "name": s["name"], "short": s["name"].split(":")[0],
            "kind": KIND.get(s["category"], "landmark"), "rule": "world_heritage", "rank": len(wonders) + 1,
            "metrics": {"inscribed": s["inscribed"], "category": s["category"], "danger": s["danger"], "whc_id": s["id"]},
            "cells": None, "curated": False, **at,
        })
    write_web("wonders.json", {
        "version": 1, "vintage": {"heritage": payload["vintage"]}, "sources": ["unesco_whc"],
        "rules": [{"id": "world_heritage", "kind": "landmark", "kinds": ["natural", "landmark"], "text": RULE_TEXT}],
        "national": {"world_heritage": len(wonders)},
        "wonders": wonders,
    })
    print(f"    {len(wonders)} World Heritage sites" + (f"; not on the map: {missing}" if missing else ""))


def check(web_dir: Path) -> list[tuple[str, str]]:
    p = Path(web_dir) / "wonders.json"
    if not p.exists():
        return [("NOTE", "wonders.json: missing (optional, skipped)")]
    doc = json.loads(p.read_text())
    bad = [w["id"] for w in doc.get("wonders", []) if w.get("cell") is None or w.get("kind") not in ("natural", "landmark")]
    if bad:
        return [("FAIL", f"wonders.json: {len(bad)} wonders without a cell or with an unknown kind: {bad[:5]}")]
    return [("PASS", f"wonders.json: {len(doc.get('wonders', []))} World Heritage sites")]
