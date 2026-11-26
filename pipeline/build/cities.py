"""Cities = metro/micro areas with ACS 1-year data, placed at their principal city.

Each city keeps its true position (x, y) and gets one land cell for its banner:
the cell under the principal city, snapped to the nearest US land cell when that
is water or foreign, and nudged up to 2 rings away when a bigger city already
holds it. GDP (Gold) is the sum of the metro's counties from BEA CAGDP2.
Population growth (2021 → the ACS year) comes from the Census population estimates, which
cover every year on today's metro borders (see growth.py).
For the City view each city also gets its member counties, a hex footprint (cells where most
county samples are member counties), its yearly population series, ranks among all cities and
its 5 nearest peers by population (see docs/DATA_CONTRACTS.md).
"""

from __future__ import annotations

import math
import re

from ..core.geo import MapProjection
from ..core.hexgrid import HexGrid
from ..core.store import load_interim, load_interim_payload, write_web
from .growth import Growth
from .yields import GDP_INDUSTRIES, INDUSTRY_LINES, YIELDS, bea_combos, economy, gdp_profile, sum_counties

REQUIRES = ["_world", "ibge_census", "ibge_gdp", "ibge_arranjos", "ibge_localities", "ibge_boundaries", "ibge_cempre"]
PRODUCES = ["cities.json", "nation.json"]

NON_CONUS = {"AK", "HI", "PR"}
CAPITAL_CBSA = "47900"  # Washington-Arlington-Alexandria, DC-VA-MD-WV
DISPLAY_NAME = {"Boise City": "Boise"}  # official CBSA names that read oddly on a map
HYPHENATED = {"Winston-Salem", "Wilkes-Barre", "Sedro-Woolley", "Lee's Summit", "Coeur d'Alene"}
PLACE_SUFFIX = re.compile(
    r" (city|town|village|borough|municipality|CDP|city and borough|urban county|"
    r"metropolitan government|consolidated government|unified government)\b.*$"
)


def parse_cbsa_name(full: str) -> tuple[str, list[str]]:
    """'Dallas-Fort Worth-Arlington, TX Metro Area' → ('Dallas', ['TX'])."""
    base = re.sub(r" (Metro|Micro) Area$", "", full)
    cities, _, states = base.rpartition(", ")
    first = cities
    for h in HYPHENATED:
        if cities.startswith(h):
            first = h
            break
    else:
        first = re.split(r"--|-|/", cities)[0]
    return first.strip(), states.split("-")


def name_matches(pname: str, name: str) -> bool:
    return pname == name or pname.startswith((name + " ", name + "-", name + "/"))


def principal_place(places_by_state: dict, name: str, state: str):
    """Fallback: the Gazetteer place best matching `name` in `state` (exact name first, then largest)."""
    best = None
    for p in places_by_state.get(state, ()):
        pname = p["name"]
        if not name_matches(pname, name):
            continue
        rest = PLACE_SUFFIX.sub("", pname)
        exact = rest == name or rest.startswith(name + "-")
        score = (exact, p["aland_km2"])
        if best is None or score > best[0]:
            best = (score, p)
    return best[1] if best else None


def delineated_place(principals: list[dict], places_by_geoid: dict, name: str, states: list[str]):
    """The OMB principal city that the CBSA title names first, as a Gazetteer place."""
    for p in principals:
        place = places_by_geoid.get(p["place_geoid"])
        if place and name_matches(PLACE_SUFFIX.sub("", p["name"]), name) and place["usps"] in states:
            return place
    return None


def ring_search(grid: HexGrid, start: int, max_rings: int):
    """Yield (ring, cell) for every cell within `max_rings` steps of `start`, nearest rings first."""
    seen = {start}
    frontier = [start]
    yield 0, start
    for ring in range(1, max_rings + 1):
        nxt = []
        for c in frontier:
            for n in grid.neighbours(c):
                if n not in seen:
                    seen.add(n)
                    nxt.append(n)
                    yield ring, n
        frontier = nxt


def nearest_land(grid: HexGrid, owner: list[int], cell: int, x: float, y: float, state: int, max_rings=8):
    """Nearest US land cell to (x, y), preferring `state`: the first ring with land, plus one more."""
    found_ring = None
    best = None
    for ring, c in ring_search(grid, cell, max_rings):
        if found_ring is not None and ring > found_ring + 1:
            break
        if owner[c] < 0:
            continue
        found_ring = ring if found_ring is None else found_ring
        cx, cy = grid.center(*grid.col_row(c))
        score = (owner[c] != state, math.hypot(cx - x, cy - y))
        if best is None or score < best[0]:
            best = (score, c)
    return best[1] if best else -1


def free_cell(grid: HexGrid, owner, taken: set, cell: int, x: float, y: float, state: int, max_rings=2):
    """Nearest untaken land cell within `max_rings`, preferring `state`; None if there is none."""
    best = None
    for ring, c in ring_search(grid, cell, max_rings):
        if owner[c] < 0 or c in taken:
            continue
        cx, cy = grid.center(*grid.col_row(c))
        score = (owner[c] != state, math.hypot(cx - x, cy - y))
        if best is None or score < best[0]:
            best = (score, c)
    return best[1] if best else None


FOOTPRINT_MAJORITY = 4  # of a cell's 7 county samples
PEERS = 5
RANK_KEYS = ["population", "gdp", "gdp_per_capita", "growth"] + [y["key"] for y in YIELDS]


def footprints(world: dict, members: dict[str, list[str]]) -> dict[str, set[int]]:
    """CBSA code → US land cells where at least FOOTPRINT_MAJORITY of the 7 county samples are member counties."""
    cbsa_of = {g: code for code, geoids in members.items() for g in geoids}
    by_index = [cbsa_of.get(g) for g in world["counties"]]
    out: dict[str, set[int]] = {}
    for cell, s in enumerate(world["county_samples"]):
        if not s or world["owner"][cell] < 0:
            continue
        votes: dict[str, int] = {}
        for k in s:
            code = by_index[k] if k >= 0 else None
            if code:
                votes[code] = votes.get(code, 0) + 1
        for code, n in votes.items():
            if n >= FOOTPRINT_MAJORITY:
                out.setdefault(code, set()).add(cell)
    return out


def pop_series(pep: dict | None, code: str, members: list[str] | None) -> dict | None:
    """{year: population} from the PEP metro file, or None (missing, or a different county list, as for growth)."""
    rec = pep["cbsa"].get(code) if pep else None
    if not rec or not rec.get("pop") or (members is not None and set(members) != set(rec["counties"])):
        return None
    return {str(y): (round(v) if v is not None else None) for y, v in zip(pep["years"], rec["pop"])}


def add_ranks(cities: list[dict]) -> None:
    """ranks: 1 = highest among all cities, null where the value is null (cities are sorted by population,
    so ties keep population order). peers: the PEERS cities closest in population (by ratio)."""
    def value(c, key):
        if key == "gdp_per_capita":
            return c["gdp"] / c["population"] if c.get("gdp") is not None and c.get("population") else None
        if key in ("population", "gdp", "growth"):
            return c.get(key)
        return c["yields"].get(key)

    for c in cities:
        c["ranks"] = {}
    for key in RANK_KEYS:
        have = [c for c in cities if value(c, key) is not None]
        have.sort(key=lambda c: -value(c, key))  # stable: ties stay in population order
        for r, c in enumerate(have, 1):
            c["ranks"][key] = r
        for c in cities:
            c["ranks"].setdefault(key, None)
    for i, c in enumerate(cities):
        lp = math.log(c["population"])
        near = sorted((abs(math.log(o["population"]) - lp), j) for j, o in enumerate(cities) if j != i)
        c["peers"] = [cities[j]["id"] for _, j in near[:PEERS]]


YIELD_LABEL = {"food": "Comida", "production": "Produção", "gold": "Ouro", "science": "Ciência", "culture": "Cultura"}
INDUSTRY_LABEL = {
    "agriculture": "Agropecuária, produção florestal e pesca", "mining": "Indústrias extrativas",
    "construction": "Construção", "manufacturing": "Indústria de transformação", "wholesale": "Comércio atacadista",
    "retail": "Comércio varejista e de veículos", "transportation": "Transporte, armazenagem e correio",
    "utilities": "Eletricidade, gás, água e esgoto", "information": "Informação e comunicação",
    "finance": "Atividades financeiras e seguros", "real_estate": "Atividades imobiliárias",
    "professional": "Atividades profissionais, científicas e técnicas", "management": "Sedes de empresas e consultoria",
    "admin": "Atividades administrativas", "education": "Educação", "health": "Saúde e serviços sociais",
    "arts": "Artes, cultura, esporte e recreação", "accommodation": "Alojamento e alimentação",
    "other": "Outros serviços", "public_admin": "Administração pública", "government": "Governo",
}


def brazil_yields() -> list[dict]:
    """The yield definitions for Brazil: Gold is municipal GDP; the job yields count CEMPRE formal jobs."""
    out = []
    for y in YIELDS:
        y = dict(y, label=YIELD_LABEL[y["key"]])
        if y["key"] == "gold":
            # unit stays "usd": the browser reads it as "money" (shown as R$, web/js/format.js)
            y["description"] = ("PIB a preços correntes de 2023, em reais (IBGE, PIB dos Municípios). O Ouro de uma "
                                "cidade é a soma do PIB dos seus municípios.")
        else:
            sectors = {"food": "na agropecuária, produção florestal e pesca",
                       "production": "na indústria de transformação, na construção e nas indústrias extrativas",
                       "science": "nos serviços profissionais, científicos e técnicos e na informação e comunicação",
                       "culture": "nas artes, cultura, esporte e recreação"}[y["key"]]
            y["description"] = (f"Empregos formais assalariados {sectors}, contados onde fica a empresa (IBGE, "
                                f"Cadastro Central de Empresas 2024). Não conta o trabalho informal.")
        out.append(y)
    return out


# Each upstream industry key as CNAE 2.0 sections or divisions (IBGE CEMPRE). Management of companies is division 70
# (head offices and consulting), so professional services are section M without it.
INDUSTRY_CNAE = {
    "agriculture": ["A"], "mining": ["B"], "construction": ["F"], "manufacturing": ["C"], "wholesale": ["46"],
    "retail": ["45", "47"], "transportation": ["H"], "utilities": ["D", "E"], "information": ["J"], "finance": ["K"],
    "real_estate": ["L"], "professional": ["69", "71", "72", "73", "74", "75"], "management": ["70"],
    "admin": ["N"], "education": ["P"], "health": ["Q"], "arts": ["R"], "accommodation": ["I"],
    "other": ["S", "T", "U"], "public_admin": ["O"],
}


def municipal_jobs(q: dict | None, munis: list[str]) -> tuple[dict, int | None]:
    """Formal salaried jobs per industry key summed over municipalities, and the total. A suppressed municipality is
    left out (the sum is a floor); a key with nothing disclosed is None, never 0."""
    if q is None:
        return {k: None for k in INDUSTRY_LINES}, None
    out = {}
    for key, codes in INDUSTRY_CNAE.items():
        total, disclosed = 0, False
        for m in munis:
            for c in codes:
                row = q["counties"].get(c, {}).get(m)
                if row is None:
                    disclosed = True  # no local unit: a real 0
                elif row[0] is not None:
                    total += row[0][0]
                    disclosed = True
        out[key] = total if disclosed else None
    known = [q["totals"][m][0] for m in munis if q["totals"].get(m)]
    return out, (sum(known) if known else None)


def level_jobs(values_of) -> dict:
    """Jobs per industry key for a state or the nation; values_of(code) → jobs or None."""
    out = {}
    for key, codes in INDUSTRY_CNAE.items():
        vals = [values_of(c) for c in codes]
        out[key] = None if any(v is None for v in vals) else sum(vals)
    return out


def empty_economy(population, gdp, gdp_year, jobs: dict | None = None, employed=None) -> dict:
    """The economic shape of a city, state or nation: population, GDP and formal jobs (null = unknown)."""
    jobs = jobs or {k: None for k in INDUSTRY_LINES}
    yields = {}
    for y in YIELDS:
        if y["key"] == "gold":
            yields["gold"] = gdp
        else:
            vals = [jobs.get(k) for k in y["industries"]]
            yields[y["key"]] = None if any(v is None for v in vals) else sum(vals)
    return {
        "population": population,
        "yields": yields,
        "jobs": jobs,
        "employed": employed,
        "median_income": None,
        "median_rent": None,
        "home_value": None,
        "unemployment": None,
        "rent_burden": None,
        "gdp": gdp,
        "gdp_year": gdp_year if gdp is not None else None,
        "gdp_by_industry": None,
        "gdp_undisclosed": None,
        "gdp_estimated": None,
        "growth": None,
        "growth_years": None,
    }


MIN_ISOLATED_POP = 50_000  # a municipality outside every arranjo becomes a city from this population
METRO_POP = 100_000  # IBGE's threshold for an urban concentration (concentração urbana)
CAPITAL_CODE = "5300108"  # Brasília
CITY_RULE = (
    f"Cada arranjo populacional do IBGE (grupos de municípios integrados pelo deslocamento para trabalhar e "
    f"estudar, ou pela mancha urbana contínua) é uma cidade, e todo município fora de arranjo com pelo menos "
    + f"{MIN_ISOLATED_POP:,}".replace(",", ".") + f" habitantes no Censo 2022 também. A cidade leva o nome do município que dá nome ao "
    f"arranjo (o mais populoso, se o título não nomear nenhum), e o estandarte fica na sede dele."
)


def title_principal(arranjo: dict, codes: list[str], pop: dict) -> str:
    """The municipality the IBGE title names first ("Vitória/ES" → Vitória, not the larger Serra); the most
    populous member when the title names none of them."""
    first = re.split(r"/| - ", arranjo["name"])[0].strip()
    named = [m["code"] for m in arranjo["members"] if m["name"] == first and m["code"] in codes]
    return named[0] if named else max(codes, key=lambda m: pop.get(m) or 0)


def sum_or_none(values) -> float | None:
    """Sum, or None when any member is unknown (a partial sum would look like a real total)."""
    values = list(values)
    return None if any(v is None for v in values) else sum(values)


def build() -> None:
    world = load_interim("_world")
    census = load_interim("ibge_census")
    gdp = load_interim("ibge_gdp")
    arranjos = load_interim("ibge_arranjos")["arranjos"]
    seats = load_interim("ibge_localities")["seats"]
    bounds = load_interim("ibge_boundaries")
    gdp_year = load_interim_payload("ibge_gdp")["data"]["year"]
    proj = MapProjection(**world["projection"])
    grid = HexGrid(**world["grid"])
    owner = world["owner"]
    state_index = {fips: i for i, fips in enumerate(world["states"])}
    abbr = {s["fips"]: s["abbr"] for s in bounds["states"]}
    pop, money = census["municipalities"], gdp["municipalities"]
    names = {c["geoid"]: c["name"] for c in bounds["counties"]}
    cempre = load_interim("ibge_cempre")

    groups = []  # (members, full name, principal)
    in_arranjo = set()
    for a in arranjos:
        codes = [m["code"] for m in a["members"] if m["code"] in pop]
        in_arranjo.update(codes)
        groups.append((codes, f"Arranjo Populacional de {a['name']}", title_principal(a, codes, pop)))
    for code, p in pop.items():
        if code not in in_arranjo and p is not None and p >= MIN_ISOLATED_POP:
            groups.append(([code], f"{names.get(code, code)} ({abbr[code[:2]]})", code))

    cities, no_seat = [], []
    for members, full, principal in groups:
        seat = seats.get(principal)
        if seat is None:
            no_seat.append(full)
            continue
        x, y = proj(seat["lon"], seat["lat"])
        ufs = []
        for m in sorted(members, key=lambda m: -(pop.get(m) or 0)):
            if abbr[m[:2]] not in ufs:
                ufs.append(abbr[m[:2]])
        population = sum_or_none(pop.get(m) for m in members)
        city_gdp = sum_or_none(money.get(m) for m in members)
        cities.append(
            {
                "id": principal,
                "name": names.get(principal, seat["name"]),
                "full": full,
                "states": ufs,
                "metro": (population or 0) >= METRO_POP,
                "capital": principal == CAPITAL_CODE,
                "x": round(x, 1),
                "y": round(y, 1),
                "cell": grid.cell_at(x, y),
                **empty_economy(population, city_gdp, gdp_year, *municipal_jobs(cempre, members)),
                "counties": sorted(members),
                "pop_series": None,
            }
        )
    cities.sort(key=lambda c: -c["population"])

    # Banner cells: on Brazilian land, one city per cell where possible (bigger cities choose first).
    fips_of_abbr = {v: k for k, v in abbr.items()}
    taken: set[int] = set()
    snapped, moved, shared = [], [], []
    for c in cities:
        state = state_index.get(fips_of_abbr[c["states"][0]], -1)
        cell = c["cell"]
        if cell < 0 or owner[cell] < 0:
            cell = nearest_land(grid, owner, max(cell, 0), c["x"], c["y"], state)
            snapped.append(c["name"])
        if cell in taken:
            alt = free_cell(grid, owner, taken, cell, c["x"], c["y"], state)
            if alt is None:
                shared.append(c["name"])
            else:
                cell = alt
                moved.append(c["name"])
        taken.add(cell)
        c["cell"] = cell

    feet = footprints(world, {c["id"]: c["counties"] for c in cities})
    for c in cities:
        c["footprint"] = sorted(feet.get(c["id"], set()) | {c["cell"]})
    add_ranks(cities)

    print(f"    {len(cities)} cities ({len(arranjos)} arranjos + {len(cities) - len(arranjos) + len(no_seat)} isolated)")
    for label, items in (("without a seat point (left out)", no_seat), ("snapped off water/foreign cells", snapped),
                         ("moved to a free neighbouring cell", moved), ("still sharing a cell", shared)):
        if items:
            print(f"    {len(items)} {label}: {', '.join(items[:8])}{' …' if len(items) > 8 else ''}")

    nation = empty_economy(census["nation"]["1"], gdp["nation"]["1"], gdp_year,
                           level_jobs(lambda c: (cempre["us"].get(c) or [None])[0] and cempre["us"][c][0][0]),
                           cempre["us_total"][0])
    write_web("cities.json", cities)
    write_web(
        "nation.json",
        {
            "vintage": "Censo 2022",
            "year": 2022,
            "gdp_vintage": f"IBGE, PIB dos Municípios {gdp_year}",
            "city_rule": CITY_RULE,
            "nation": nation,
            "yields": brazil_yields(),
            "industries": {k: INDUSTRY_LABEL.get(k, label) for k, (_, label) in INDUSTRY_LINES.items()},
            "gdp_industries": {k: INDUSTRY_LABEL.get(k, label) for k, label in GDP_INDUSTRIES.items()},
        },
    )
