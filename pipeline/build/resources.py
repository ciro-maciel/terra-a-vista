"""Recursos dos hexágonos: as usinas, os campos de petróleo e gás, as plataformas, as minas e o agro do Brasil.

Como recursos estratégicos num hexágono de jogo, mas só os locais relevantes: cada tipo tem um limite (escrito na
sua descrição). Usinas eólicas e solares são somadas por hexágono, porque um parque grande é registrado como muitas
usinas. As plataformas ficam no mar, onde estão. As minas somam a área das concessões de lavra por hexágono, e o
agro distribui a produção de cada município pelos hexágonos que ele ocupa.

Cada item leva o estado e (se houver) a cidade do mapa que contém o município do centro do hexágono, e `summary`
soma os locais mapeados por tipo, no país e por estado.

`types` vem em ordem de importância; o navegador usa essa ordem quando só cabe um ícone por hexágono.
"""

from __future__ import annotations

import json
import math
from collections import defaultdict

from ..core.geo import MapProjection
from ..core.hexgrid import HexGrid
from ..core.paths import WEB_DATA
from ..core.store import load_interim, write_web

REQUIRES = ["_world", "aneel_siga", "anp_geo", "anm_sigmine", "ibge_agro", "ibge_boundaries", "ibge_localities",
            "cities.json"]
PRODUCES = ["resources.json"]

OPERATING = "Operação"
PLANT_MIN = {"hydro": 100, "gas_plant": 200, "coal_plant": 100}  # MW, single plants
CLUSTER_MIN = {"wind": 150, "solar": 150, "biomass": 150}  # MW summed per hex
PLATFORM_MIN_BPD = 20_000
FIELD_MIN_KM2 = 10
MINE_MIN_HA = 500  # concession area summed per hex
AGRO_TOP = 30  # the hexes that produce most of each crop (never two side by side)
SITE_RINGS = 2


def _n(x) -> str:
    return f"{x:,.0f}".replace(",", ".")


def _t(id, name, category, color, unit, description, source, icon=None):
    return {"id": id, "name": name, "category": category, "icon": icon or f"r-{id}", "color": color,
            "unit": unit, "description": description, "source": source}


def _mineral(id, name, color, what, icon=None):
    return _t(id, name, "mineral", color, "ha",
              f"{what} Hexágonos cuja soma de concessões de lavra ativas chega a pelo menos {_n(MINE_MIN_HA)} hectares "
              "(ANM, SIGMINE). O valor é a área concedida, não a produção.", "anm_sigmine", icon)


def _crop(id, name, color, unit_word):
    return _t(id, name, "agri", color, unit_word,
              f"Os {AGRO_TOP} hexágonos que mais produzem (IBGE, PAM e PPM 2025), nunca dois vizinhos (fica o maior). A "
              "produção de cada município é dividida pelos hexágonos que ele ocupa.", "ibge_agro", "l-farmland")


TYPES = [
    _t("nuclear", "Usina nuclear", "energy", "#e8d44d", "MW",
       "Toda usina nuclear em operação (ANEEL, SIGA). O valor é a potência outorgada.", "aneel_siga"),
    _t("hydro", "Hidrelétrica", "energy", "#3fa7d6", "MW",
       f"Usinas hidrelétricas (UHE) em operação com pelo menos {PLANT_MIN['hydro']} MW (ANEEL, SIGA). Itaipu aparece "
       "com a parte brasileira.", "aneel_siga"),
    _t("platform", "Plataforma de petróleo", "energy", "#2a2420", "barris/dia",
       f"Unidades de produção no mar (plataformas fixas e flutuantes, FPSOs) com capacidade de processar pelo menos "
       f"{_n(PLATFORM_MIN_BPD)} barris de petróleo por dia (ANP, GeoMaps). Ficam no mar, onde estão.", "anp_geo", "r-oil"),
    _t("oil", "Campo de petróleo", "energy", "#3a2f2a", "km² de campo",
       f"Campos na etapa de produção cujo fluido principal é o óleo, com pelo menos {FIELD_MIN_KM2} km² (ANP). O valor "
       "é a área do campo, não a produção.", "anp_geo"),
    _t("gas", "Campo de gás natural", "energy", "#8fb3c9", "km² de campo",
       f"Campos na etapa de produção cujo fluido principal é o gás, com pelo menos {FIELD_MIN_KM2} km² (ANP). O valor "
       "é a área do campo, não a produção.", "anp_geo"),
    _mineral("iron", "Mina de ferro", "#8a4b2a", "Minério de ferro."),
    _mineral("gold", "Mina de ouro", "#d4af37", "Ouro."),
    _mineral("copper", "Mina de cobre", "#b87333", "Cobre."),
    _mineral("bauxite", "Mina de bauxita", "#c0704a", "Bauxita, o minério do alumínio.", "r-lead_zinc"),
    _mineral("manganese", "Mina de manganês", "#6f6f8f", "Manganês.", "r-lead_zinc"),
    _mineral("nickel", "Mina de níquel", "#7f9a8a", "Níquel.", "r-lead_zinc"),
    _mineral("tin", "Mina de estanho", "#9aa4ae", "Cassiterita, o minério do estanho.", "r-lead_zinc"),
    _mineral("coal_mine", "Mina de carvão", "#4a4038", "Carvão mineral."),
    _mineral("niobium", "Mina de nióbio", "#5a8aa8", "Nióbio (pirocloro).", "r-rare_earths"),
    _mineral("phosphate", "Mina de fosfato", "#a8b86a", "Fosfato, base dos fertilizantes.", "r-lead_zinc"),
    _mineral("potash", "Mina de potássio", "#c87a8a", "Potássio (silvinita), base dos fertilizantes.", "r-lead_zinc"),
    _mineral("kaolin", "Mina de caulim", "#e8e0d0", "Caulim.", "r-lead_zinc"),
    _mineral("diamond", "Garimpo de diamante", "#c0e0f0", "Diamante.", "r-platinum"),
    _t("coal_plant", "Termelétrica a carvão", "energy", "#5a5a5a", "MW",
       f"Usinas térmicas a carvão mineral em operação com pelo menos {PLANT_MIN['coal_plant']} MW (ANEEL, SIGA).",
       "aneel_siga"),
    _t("gas_plant", "Termelétrica a gás", "energy", "#f08a24", "MW",
       f"Usinas térmicas a gás natural em operação com pelo menos {PLANT_MIN['gas_plant']} MW (ANEEL, SIGA).",
       "aneel_siga"),
    _t("wind", "Parques eólicos", "energy", "#9fd8cb", "MW",
       f"Potência eólica em operação somada por hexágono, onde chega a pelo menos {CLUSTER_MIN['wind']} MW (ANEEL, "
       "SIGA): um parque grande é registrado como muitas usinas.", "aneel_siga"),
    _t("biomass", "Biomassa (bagaço de cana)", "energy", "#9bb04a", "MW",
       f"Potência das térmicas a biomassa da agroindústria em operação (sobretudo bagaço de cana), somada por "
       f"hexágono onde chega a pelo menos {CLUSTER_MIN['biomass']} MW (ANEEL, SIGA).", "aneel_siga", "r-gas_plant"),
    _t("solar", "Usinas solares", "energy", "#ffc93c", "MW",
       f"Potência solar fotovoltaica em operação somada por hexágono, onde chega a pelo menos {CLUSTER_MIN['solar']} MW "
       "(ANEEL, SIGA). Inclui a geração distribuída só quando registrada no SIGA.", "aneel_siga"),
    _crop("soy", "Soja", "#c9b24a", "t"),
    _crop("corn", "Milho", "#e2c03a", "t"),
    _crop("sugarcane", "Cana-de-açúcar", "#7fb04a", "t"),
    _crop("coffee", "Café", "#7a4a2a", "t"),
    _crop("orange", "Laranja", "#f09a2a", "t"),
    _crop("cotton", "Algodão", "#e8e4d8", "t"),
    _crop("rice", "Arroz", "#e8dca8", "t"),
    _crop("beans", "Feijão", "#8a3a2a", "t"),
    _crop("cassava", "Mandioca", "#c8a070", "t"),
    _crop("wheat", "Trigo", "#d8b84a", "t"),
    _crop("cocoa", "Cacau", "#6a3a20", "t"),
    _crop("banana", "Banana", "#f0d040", "t"),
    _crop("grape", "Uva", "#7a3a8a", "t"),
    _crop("tobacco", "Fumo", "#9a7a3a", "t"),
    _crop("cattle", "Rebanho bovino", "#a0704a", "cabeças"),
    _crop("pigs", "Suínos", "#e0a0a0", "cabeças"),
    _crop("chickens", "Galinhas", "#f0e0c0", "cabeças"),
]
RANK = {t["id"]: i for i, t in enumerate(TYPES)}
NOT_ADDITIVE = {"oil", "gas"}  # field areas: a sum is not an output
SUMMARY_NOTE = ("Totais só dos locais mapeados: cada tipo tem um limite (veja a descrição), então não são a "
                "capacidade nem a produção total de um estado ou do país. Campos de petróleo e gás não se somam.")


class Placer:
    """lon/lat → (x, y, cell). Land sites snap to a Brazilian land hex up to SITE_RINGS away; sea sites keep theirs."""

    def __init__(self, world):
        self.proj = MapProjection(**world["projection"])
        self.grid = HexGrid(**world["grid"])
        self.owner = world["owner"]

    def land_cell(self, x, y, rings=SITE_RINGS) -> int:
        cell = self.grid.cell_at(x, y)
        if cell < 0:
            return -1
        if self.owner[cell] >= 0:
            return cell
        seen, frontier = {cell}, [cell]
        for _ in range(rings):
            ring = [n for c in frontier for n in self.grid.neighbours(c) if n not in seen]
            seen.update(ring)
            land = [n for n in ring if self.owner[n] >= 0]
            if land:
                return min(land, key=lambda n: math.dist(self.grid.center(*self.grid.col_row(n)), (x, y)))
            frontier = ring
        return -1

    def at(self, lon, lat, sea=False):
        if lon is None or lat is None:
            return None
        x, y = self.proj(lon, lat)
        cell = self.grid.cell_at(x, y) if sea else self.land_cell(x, y)
        return None if cell is None or cell < 0 else (x, y, cell)


def _item(type_id, name, at, value, detail):
    x, y, cell = at
    return {"type": type_id, "name": name, "x": x, "y": y, "cell": cell,
            "value": None if value is None else round(value, 1), "detail": detail}


def power_plants(place: Placer) -> list[dict]:
    plants = [p for p in load_interim("aneel_siga")["plants"] if p["phase"] == OPERATING and p["mw"]]
    items = []
    for p in plants:
        kind, fuel = p["kind"], p["fuel"]
        tid = ("nuclear" if kind == "UTN" else "hydro" if kind == "UHE" and p["mw"] >= PLANT_MIN["hydro"]
               else "gas_plant" if kind == "UTE" and fuel == "Gás natural" and p["mw"] >= PLANT_MIN["gas_plant"]
               else "coal_plant" if kind == "UTE" and fuel == "Carvão mineral" and p["mw"] >= PLANT_MIN["coal_plant"]
               else None)
        if tid is None:
            continue
        at = place.at(p["lon"], p["lat"])
        if at:
            detail = ", ".join(x for x in (p["places"], f"desde {p['since']}" if p["since"] else "") if x)
            items.append(_item(tid, p["name"], at, p["mw"], detail))
    # wind and solar: summed per hex
    for tid, kind in (("wind", "EOL"), ("solar", "UFV"), ("biomass", "UTE")):
        by_cell: dict[int, list] = defaultdict(list)
        for p in plants:
            if p["kind"] != kind or (tid == "biomass" and p["fuel"] != "Agroindustriais"):
                continue
            at = place.at(p["lon"], p["lat"])
            if at:
                by_cell[at[2]].append((p, at))
        for cell, group in by_cell.items():
            mw = sum(p["mw"] for p, _ in group)
            if mw < CLUSTER_MIN[tid]:
                continue
            x = sum(a[0] * p["mw"] for p, a in group) / mw
            y = sum(a[1] * p["mw"] for p, a in group) / mw
            place_name = max(group, key=lambda g: g[0]["mw"])[0]["places"].split(" - ")[0] or "?"
            label = {"wind": "Eólicas de ", "solar": "Solares de ", "biomass": "Biomassa de "}[tid] + place_name
            items.append(_item(tid, label, (x, y, cell), mw, f"{len(group)} usinas somadas no hexágono"))
    return items


def _unit_name(name: str) -> str:
    """'FPSO ANNA NERY' → 'FPSO Anna Nery'; 'PETROBRAS 80' → 'Petrobras 80'."""
    keep = {"FPSO", "FSO", "UEP", "SS"}
    return " ".join(w if w in keep else w.capitalize() if w.isalpha() else w for w in name.split())


def oil_and_gas(place: Placer) -> list[dict]:
    anp = load_interim("anp_geo")
    items = []
    for u in anp["units"]:
        if (u["oil_bpd"] or 0) < PLATFORM_MIN_BPD:
            continue
        at = place.at(u["lon"], u["lat"], sea=True)
        if at:
            items.append(_item("platform", _unit_name(u["name"]), at, u["oil_bpd"],
                               ", ".join(x for x in (u["kind"] and u["kind"].lower(), u["fields"] and f"atende {u['fields']}") if x)))
    for f in anp["fields"]:
        if f["stage"] != "Produção" or (f["area_km2"] or 0) < FIELD_MIN_KM2:
            continue
        tid = "oil" if f["fluid"] == "ÓLEO" else "gas" if f["fluid"] == "GÁS" else None
        if tid is None:
            continue
        at = place.at(f["lon"], f["lat"], sea=f["where"] == "Mar")
        if at:
            items.append(_item(tid, f["name"], at, f["area_km2"],
                               f"bacia {f['basin']}, {'no mar' if f['where'] == 'Mar' else 'em terra'}"))
    return items


def mines(place: Placer) -> list[dict]:
    by = defaultdict(lambda: [0.0, 0, [], []])  # (mineral, cell) → [ha, n, holders, xy]
    for c in load_interim("anm_sigmine")["concessions"]:
        if not c["mineral"] or not c["ha"]:
            continue
        at = place.at(c["lon"], c["lat"])
        if not at:
            continue
        row = by[(c["mineral"], at[2])]
        row[0] += c["ha"]
        row[1] += 1
        row[2].append((c["ha"], c["holder"]))
        row[3].append((at[0] * c["ha"], at[1] * c["ha"]))
    items = []
    for (mineral, cell), (ha, n, holders, xy) in by.items():
        if ha < MINE_MIN_HA:
            continue
        x, y = sum(p[0] for p in xy) / ha, sum(p[1] for p in xy) / ha
        top = max(holders)[1].title() if holders else ""
        items.append(_item(mineral, top or TYPES[RANK[mineral]]["name"], (x, y, cell), ha,
                           f"{n} {'concessão' if n == 1 else 'concessões'} de lavra"))
    return items


def agro(place: Placer, world: dict) -> list[dict]:
    """Crops and cattle: each municipality's output split over its hexes by its share of sample points (a
    municipality no sample hits goes to its seat's hex), then the AGRO_TOP strongest hexes, never two of the same
    product side by side."""
    data = load_interim("ibge_agro")
    seats = load_interim("ibge_localities")["seats"]
    names = {c["geoid"]: c["name"] for c in load_interim("ibge_boundaries")["counties"]}
    cells_of: dict[str, dict[int, int]] = defaultdict(dict)
    for cell, s in enumerate(world["county_samples"]):
        for k in s:
            if k >= 0:
                m = world["counties"][k]
                cells_of[m][cell] = cells_of[m].get(cell, 0) + 1
    items = []
    for key, values in data["products"].items():
        total = sum(v for v in values.values() if v)
        if not total:
            continue
        hexval: dict[int, float] = defaultdict(float)
        best: dict[int, tuple[float, str]] = {}

        def add(cell, share, mun):
            hexval[cell] += share
            if share > best.get(cell, (0.0, ""))[0]:
                best[cell] = (share, mun)

        for mun, v in values.items():
            if not v:
                continue
            cells = cells_of.get(mun)
            if cells:
                n = sum(cells.values())
                for cell, k in cells.items():
                    add(cell, v * k / n, mun)
            else:
                seat = seats.get(mun)
                at = place.at(seat["lon"], seat["lat"]) if seat else None
                if at:
                    add(at[2], v, mun)
        cand = sorted(((v, c) for c, v in hexval.items()), reverse=True)
        taken: set[int] = set()
        for v, cell in cand:
            if len(taken) >= AGRO_TOP:
                break
            if any(n in taken for n in place.grid.neighbours(cell)):
                continue
            taken.add(cell)
            x, y = place.grid.center(*place.grid.col_row(cell))
            mun = best[cell][1]
            # a municipality created after the 2022 mesh (Boa Esperança do Norte, MT) is named by its seat
            label = f"{TYPES[RANK[key]]['name']} de {names.get(mun) or seats.get(mun, {}).get('name', '?')}"
            items.append(_item(key, label, (x, y, cell), v, f"{v / total:.1%} da produção nacional".replace(".", ",")))
    return items


def _settle(items: list[dict], grid: HexGrid) -> int:
    """Round x/y, and move any point whose rounded position is not in its cell to that cell's centre."""
    moved = 0
    for it in items:
        x, y = round(it["x"], 1), round(it["y"], 1)
        if grid.cell_at(x, y) != it["cell"]:
            x, y = (round(v, 1) for v in grid.center(*grid.col_row(it["cell"])))
            moved += 1
        it["x"], it["y"] = x, y
    return moved


def locate(items: list[dict], world: dict) -> None:
    """Each item's `state` (the abbr of its cell's owner; None at sea) and `cbsa` (the map city holding the
    municipality at the cell's centre, or None)."""
    abbr_of = {s["fips"]: s["abbr"] for s in load_interim("ibge_boundaries")["states"]}
    abbrs = [abbr_of.get(f) for f in world["states"]]
    city_of = {m: c["id"] for c in json.loads((WEB_DATA / "cities.json").read_text()) for m in c["counties"]}
    owner, county, geoids = world["owner"], world["county"], world["counties"]
    for it in items:
        c = it["cell"]
        it["state"] = abbrs[owner[c]] if owner[c] >= 0 else None
        it["cbsa"] = city_of.get(geoids[county[c]]) if county[c] >= 0 else None


def summarize(items: list[dict], types: list[dict]) -> dict:
    """National and per-state {type: {count, value, unit}} over the mapped items."""
    def blank(t):
        return {"count": 0, "value": None if t["id"] in NOT_ADDITIVE else 0, "unit": t["unit"]}

    by_id = {t["id"]: t for t in types}
    national = {t["id"]: blank(t) for t in types}
    states: dict[str, dict] = {}
    for it in items:
        t = by_id[it["type"]]
        rows = [national[t["id"]]]
        if it.get("state"):
            rows.append(states.setdefault(it["state"], {}).setdefault(t["id"], blank(t)))
        for row in rows:
            row["count"] += 1
            if row["value"] is not None and it["value"] is not None:
                row["value"] += it["value"]
    for row in [*national.values(), *(r for st in states.values() for r in st.values())]:
        if row["value"] is not None:
            row["value"] = round(row["value"])
    return {"note": SUMMARY_NOTE, "national": national, "states": dict(sorted(states.items()))}


def build() -> None:
    world = load_interim("_world")
    place = Placer(world)
    items = power_plants(place) + oil_and_gas(place) + mines(place) + agro(place, world)
    items.sort(key=lambda it: (RANK[it["type"]], -(it["value"] or 0)))
    moved = _settle(items, place.grid)
    locate(items, world)
    present = {it["type"] for it in items}
    types = [t for t in TYPES if t["id"] in present]
    write_web("resources.json", {"types": types, "items": items, "summary": summarize(items, types)})
    counts = defaultdict(int)
    for it in items:
        counts[it["type"]] += 1
    print("    " + ", ".join(f"{t['id']} {counts[t['id']]}" for t in TYPES))
    print(f"    {len(items)} items; {moved} sat off their hex and were moved to its centre")
