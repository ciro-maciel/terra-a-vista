"""The map itself: hex grid, land/water, relief, land cover, states, counties, rivers.

Also saves interim "_world" (grid + projection + per-cell state/county/water/cover)
so the other builders can drop their data onto the same hexes.
"""

from __future__ import annotations

import math
from collections import Counter

from ..core.geo import AlbersEllipsoid, MapProjection, Shape, ShapeIndex
from ..core.hexgrid import SQRT3, HexGrid
from ..core.store import load_interim, save_interim, write_web

REQUIRES = ["ibge_boundaries", "natural_earth", "etopo", "worldcover"]
PRODUCES = ["_world", "world.json"]

HEX_RADIUS_KM = 25.0
MARGIN_KM = 200.0
CONUS_EXCLUDE: set[str] = set()  # every Brazilian state is on the map
# Oceanic islands far out in the Atlantic (Trindade e Martim Vaz, São Pedro e São Paulo, east of -32°) would
# stretch the map by a thousand kilometres of sea; they stay off the frame. Fernando de Noronha (-32.4°) is in.
FRAME_MAX_LON = -32.0

# Cell owner codes (besides state index >= 0)
WATER, FOREIGN = -1, -2

# --- tables (written to world.json so the frontend and Almanac read one definition) ---------

LAND, OCEAN, COAST, LAKE = range(4)
TIDAL_SEA_SHARE = 0.5  # share of ETOPO samples below 0 m that keeps a sea-centred hex as water
COAST_DEPTH_M = -200
WATER_TABLE = [
    {"id": LAND, "name": "Terra", "rule": "Pelo menos 4 dos 7 pontos de amostra do hexágono (o centro e mais 6) caem dentro dos contornos dos estados do IBGE ou dos países do Natural Earth, a não ser que o centro seja mar e a média do ETOPO1 esteja no nível do mar ou abaixo, ou que pelo menos metade das amostras do ETOPO1 esteja (as baías continuam água)."},
    {"id": OCEAN, "name": "Oceano", "color": "#1b4266", "rule": "Mar com mais de 200 m de profundidade e longe da terra."},
    {"id": COAST, "name": "Costa", "color": "#2d6d97", "rule": "Mar ao lado de um hexágono de terra, ou com menos de 200 m de profundidade (média do ETOPO1)."},
    {"id": LAKE, "name": "Lago", "color": "#3a80b0", "rule": "Hexágono de água (a maioria dos 7 pontos fora da terra) com mais pontos em lagos do Natural Earth 1:50m do que no mar, ou acima do nível do mar."},
]

WATER_NOTE = (
    "Os contornos dos estados do IBGE e dos países e lagos do Natural Earth 1:50m não se encaixam com exatidão. Um "
    "hexágono de mar cuja média do ETOPO1 fica acima do nível do mar (e com menos da metade das amostras abaixo dele) "
    "vira terra quando pelo menos 4 dos 6 vizinhos são terra, ou quando toca terra brasileira e estrangeira; fica com o "
    "dono da maioria dos vizinhos. Represas estreitas, com menos da metade de um hexágono, são terra, e o rio passa por "
    "elas. As baías continuam água quando o centro do hexágono é mar e a média do ETOPO1 está no nível do mar ou abaixo, "
    "ou quando pelo menos metade das amostras está. A altitude de um hexágono de mar é a média das amostras abaixo do "
    "nível do mar (a profundidade)."
)

FLAT, HILLS, MOUNTAINS, PEAKS = range(4)
LAND_MIN_ALT_M = -100  # ETOPO samples below this inside a land hex are treated as sea floor
RELIEF_TABLE = [
    {"id": FLAT, "name": "Plano", "rule": "Desvio-padrão da altitude dentro do hexágono abaixo de 85 m."},
    {"id": HILLS, "name": "Morros", "rule": "Desvio-padrão da altitude de pelo menos 85 m."},
    {"id": MOUNTAINS, "name": "Serras", "rule": "Desvio-padrão da altitude de pelo menos 260 m, ou altitude média de pelo menos 2.300 m."},
    {"id": PEAKS, "name": "Picos", "rule": "Altitude média de pelo menos 2.700 m."},
]
RELIEF_NOTE = (
    "Das amostras do ETOPO1 (a cada ~9 km, umas 20 por hexágono) com altitude de pelo menos -100 m, para que baías e "
    "fundo do mar não contem; se nenhuma passar, usam-se todas. Hexágonos de água são sempre planos."
)

URBAN_MIN_PCT = 30
# id, key, name, colour, NLCD codes, rule. Ids are fixed by docs/DATA_CONTRACTS.md.
COVER = [
    (1, "forest_deciduous", "Floresta", "#4f7a35", [41], "A floresta é o maior grupo do hexágono (WorldCover: cobertura arbórea)."),
    (2, "forest_evergreen", "Floresta de coníferas", "#2f5a3a", [42], "Não usado no Brasil: o WorldCover não separa o tipo de floresta."),
    (3, "forest_mixed", "Floresta mista", "#43703f", [43], "Não usado no Brasil: o WorldCover não separa o tipo de floresta."),
    (4, "scrub", "Caatinga e arbustos", "#c9b07a", [52], "Os arbustos são o maior grupo: a caatinga e as formações abertas."),
    (5, "grassland", "Campo e pasto", "#a9b35a", [71, 21], "Campo e vegetação rasteira são o maior grupo; inclui os pastos, que o WorldCover não separa."),
    (6, "pasture", "Pasto", "#8fb04e", [81], "Não usado no Brasil: os pastos contam como campo."),
    (7, "cropland", "Lavoura", "#c2b84e", [82], "A lavoura é o maior grupo."),
    (8, "wetland", "Área úmida", "#4f8a6e", [90, 95], "As áreas úmidas e os mangues são o maior grupo."),
    (9, "urban", "Urbano", "#8a8378", [22, 23, 24], f"A área construída é pelo menos {URBAN_MIN_PCT}% da terra do hexágono, seja o que for o resto."),
    (10, "barren", "Solo exposto", "#bfae95", [31], "Solo exposto (rocha, areia, dunas) é o maior grupo."),
    (11, "ice", "Gelo e neve", "#e8eef2", [12], "Gelo e neve permanentes são o maior grupo."),
]
COVER_NOTE = (
    "From ESA WorldCover 2021 (the smallest overview of each tile, reduced to ~2.4 km pixels by the most common "
    "class), sampled on a 2 km lattice inside each Brazilian hex (about 400 points). WorldCover classes are read as "
    "their NLCD equivalents (pipeline/sources/worldcover.py). It has no pasture class: pasture counts as grassland. "
    "Open water and no-data pixels are ignored; shares are of the remaining land points, rounded to whole percent, "
    "and the urban threshold is applied to the rounded built-up share. Foreign hexes have cover 0 (none)."
)
# Groups competing for the dominant cover (urban is decided by its threshold first).
GROUPS = {
    "forest": (41, 42, 43), "scrub": (52,), "grassland": (71, 21), "pasture": (81,), "cropland": (82,),
    "wetland": (90, 95), "barren": (31,), "ice": (12,),
}
FOREST_ID = {41: 1, 42: 2, 43: 3}
GROUP_ID = {"scrub": 4, "grassland": 5, "pasture": 6, "cropland": 7, "wetland": 8, "barren": 10, "ice": 11}
URBAN_ID = 9
PCT = {
    "forest": (41, 42, 43), "crop": (82,), "pasture": (81,), "grass": (71, 21), "shrub": (52,),
    "wetland": (90, 95), "developed": (22, 23, 24),
}
NLCD_STEP_KM = 2.0


def classify_relief(mean: float, std: float) -> int:
    if mean >= 2700:
        return PEAKS
    if std >= 260 or mean >= 2300:
        return MOUNTAINS
    if std >= 85:
        return HILLS
    return FLAT


def is_valley_floor(samples: list) -> bool:
    """True when the lower 60% of a hex's land samples is flat lowland (within 60 m, under 400 m): the hex is mostly
    valley floor even if a range at its edge makes the whole hex's spread look hilly or mountainous."""
    if len(samples) < 6:
        return False
    v = sorted(samples)
    lo = v[: max(3, int(len(v) * 0.6))]
    return lo[-1] < 400 and lo[-1] - lo[0] < 60


def dominant_cover(counts: Counter, land: int) -> int:
    """Cover id for a hex from its NLCD class counts (land = points that are not water or no-data)."""
    if not land:
        return 0
    if round(100 * sum(counts[c] for c in (22, 23, 24)) / land) >= URBAN_MIN_PCT:  # same rounding as pct.developed
        return URBAN_ID
    best, best_n = None, 0
    for g, codes in GROUPS.items():  # dict order breaks ties
        n = sum(counts[c] for c in codes)
        if n > best_n:
            best, best_n = g, n
    if best is None:
        return 0  # only developed land below the urban threshold
    if best == "forest":
        return FOREST_ID[max((41, 42, 43), key=lambda c: counts[c])]
    return GROUP_ID[best]


def simplify(points: list[tuple[float, float]], min_km: float) -> list[tuple[float, float]]:
    out = [points[0]]
    for p in points[1:-1]:
        if math.dist(p, out[-1]) >= min_km:
            out.append(p)
    out.append(points[-1])
    return out


def clip_segment(p, q, w, h):
    """Liang–Barsky: the part of segment p→q inside [0,w]×[0,h], or None."""
    (x0, y0), (x1, y1) = p, q
    dx, dy = x1 - x0, y1 - y0
    t0, t1 = 0.0, 1.0
    for pk, qk in ((-dx, x0), (dx, w - x0), (-dy, y0), (dy, h - y0)):
        if pk == 0:
            if qk < 0:
                return None
            continue
        t = qk / pk
        if pk < 0:
            t0 = max(t0, t)
        else:
            t1 = min(t1, t)
        if t0 > t1:
            return None
    return (x0 + t0 * dx, y0 + t0 * dy), (x0 + t1 * dx, y0 + t1 * dy)


def clip_polyline(pts, w, h) -> list[list[tuple[float, float]]]:
    """Split a polyline into the pieces that lie inside the map rectangle."""
    pieces, cur = [], []
    for p, q in zip(pts, pts[1:]):
        seg = clip_segment(p, q, w, h)
        if seg is None:
            if len(cur) >= 2:
                pieces.append(cur)
            cur = []
            continue
        a, b = seg
        if cur and math.dist(cur[-1], a) < 1e-9:
            cur.append(b)
        else:
            if len(cur) >= 2:
                pieces.append(cur)
            cur = [a, b]
        if b != q:  # left the map inside this segment
            pieces.append(cur)
            cur = []
    if len(cur) >= 2:
        pieces.append(cur)
    return pieces


def land_runs(pts, is_land, step: float = 2.0) -> list[list[tuple[float, float]]]:
    """Split a projected polyline (densified every `step` km) into the runs whose points satisfy is_land."""
    runs, cur = [], []
    for k, (p, q) in enumerate(zip(pts, pts[1:])):
        n = max(1, math.ceil(math.dist(p, q) / step))
        for j in range(0 if k == 0 else 1, n + 1):
            t = j / n
            pt = (p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1]))
            if is_land(pt):
                cur.append(pt)
            else:
                if len(cur) >= 2:
                    runs.append(cur)
                cur = []
    if len(cur) >= 2:
        runs.append(cur)
    return runs


def join_lines(lines: list[list[tuple[float, float]]], tol: float = 0.5) -> list[list[tuple[float, float]]]:
    """Greedily join polylines whose ends meet (within `tol` km), reversing pieces as needed."""
    lines = [list(l) for l in lines]
    joined = True
    while joined:
        joined = False
        for a in range(len(lines)):
            for b in range(len(lines)):
                if a == b or not lines[a] or not lines[b]:
                    continue
                la, lb = lines[a], lines[b]
                for la2, lb2 in ((la, lb), (la, lb[::-1]), (la[::-1], lb), (la[::-1], lb[::-1])):
                    if math.dist(la2[-1], lb2[0]) <= tol:
                        lines[a] = la2 + lb2[1:]
                        lines[b] = []
                        joined = True
                        break
        lines = [l for l in lines if l]
    return lines


def hex_lattice(radius: float, step: float) -> list[tuple[float, float]]:
    """Offsets of a square lattice (spacing `step`) that fall inside a pointy-top hex."""
    half_w = SQRT3 / 2 * radius
    n = int(radius // step) + 1
    out = []
    for iy in range(-n, n + 1):
        for ix in range(-n, n + 1):
            x, y = (ix + 0.5) * step, (iy + 0.5) * step
            if abs(x) <= half_w and abs(y) <= radius - abs(x) / SQRT3:
                out.append((x, y))
    return out


def majority(values: list, centre) -> object:
    """Most common value; ties go to `centre` if it is among the tied, else to the first seen."""
    counts = Counter(values)
    top = max(counts.values())
    tied = [v for v in counts if counts[v] == top]
    return centre if centre in tied else tied[0]


def build() -> None:
    bounds = load_interim("ibge_boundaries")
    ne = load_interim("natural_earth")
    etopo = load_interim("etopo")
    nlcd = load_interim("worldcover")

    states = [s for s in bounds["states"] if s["fips"] not in CONUS_EXCLUDE]
    states.sort(key=lambda s: s["name"])
    counties = [c for c in bounds["counties"] if c["state_fips"] not in CONUS_EXCLUDE]
    counties.sort(key=lambda c: c["geoid"])

    # Projection: fit the country with a margin (the oceanic islands east of FRAME_MAX_LON stay off the frame).
    probe = MapProjection(0, 0, 0)
    xs, ys = [], []
    for s in states:
        for ring in s["rings"]:
            if max(lon for lon, _ in ring) > FRAME_MAX_LON:
                continue
            for lon, lat in ring:
                x, y = probe._albers(lon, lat)
                xs.append(x)
                ys.append(y)
    proj = MapProjection(min(xs), max(ys), MARGIN_KM)
    width = max(xs) - min(xs) + 2 * MARGIN_KM
    height = max(ys) - min(ys) + 2 * MARGIN_KM
    grid = HexGrid.covering(width, height, HEX_RADIUS_KM)
    print(f"    grid {grid.cols}×{grid.rows} = {grid.size} hexes of {HEX_RADIUS_KM:g} km")

    def shape(rings):
        return Shape([[proj(lon, lat) for lon, lat in r] for r in rings])

    state_idx = ShapeIndex([shape(s["rings"]) for s in states])
    county_idx = ShapeIndex([shape(c["rings"]) for c in counties], cell_km=60)
    foreign_idx = ShapeIndex([shape(c["rings"]) for c in ne["countries"]], cell_km=200)
    lake_idx = ShapeIndex([shape(l["rings"]) for l in ne["lakes"]])

    # --- elevation statistics per hex (land samples and all samples) -----------------------------
    stats_all = [[0, 0.0, 0.0] for _ in range(grid.size)]
    stats_land = [[0, 0.0, 0.0] for _ in range(grid.size)]
    samples_land = [[] for _ in range(grid.size)]  # land altitudes, for the peak height and the valley-floor test
    below_sea = [0] * grid.size  # ETOPO samples below 0 m ...
    below_sum = [0.0] * grid.size  # ... and their altitude sum
    for lat, lon, alt in zip(etopo["lat"], etopo["lon"], etopo["alt"]):
        i = grid.cell_at(*proj(lon, lat))
        if i < 0:
            continue
        if alt < 0:
            below_sea[i] += 1
            below_sum[i] += alt
        for st in (stats_all[i], stats_land[i]) if alt >= LAND_MIN_ALT_M else (stats_all[i],):
            st[0] += 1
            st[1] += alt
            st[2] += alt * alt
        if alt >= LAND_MIN_ALT_M:
            samples_land[i].append(alt)

    def sea_share(i):
        return below_sea[i] / stats_all[i][0] if stats_all[i][0] else 0.0

    def mean_std(st):
        n, s1, s2 = st
        if not n:
            return None, None
        m = s1 / n
        return m, math.sqrt(max(0.0, s2 / n - m * m))

    # --- ownership: majority of 7 sample points --------------------------------------------------
    # The centre plus six points 60% of the way to each corner. Each point is lake, a state, foreign
    # land or other water; the majority decides (the centre breaks ties). All seven also give an
    # area-weighted county mix for lenses.
    offsets = [(0.0, 0.0)] + [
        (0.6 * HEX_RADIUS_KM * math.cos(math.radians(60 * k - 30)), 0.6 * HEX_RADIUS_KM * math.sin(math.radians(60 * k - 30)))
        for k in range(6)
    ]
    owner = [WATER] * grid.size
    water = [OCEAN] * grid.size
    for i in range(grid.size):
        cx, cy = grid.center(*grid.col_row(i))
        kinds = []
        for dx, dy in offsets:
            x, y = cx + dx, cy + dy
            if lake_idx.locate(x, y) >= 0:
                kinds.append("lake")
            elif (s := state_idx.locate(x, y)) >= 0:
                kinds.append(s)
            elif foreign_idx.locate(x, y) >= 0:
                kinds.append(FOREIGN)
            else:
                kinds.append("sea")
        land = [k for k in kinds if not isinstance(k, str)]
        m_all, _ = mean_std(stats_all[i])
        # Tidal bays (Chesapeake, Mobile, Biscayne, Puget Sound) are narrower than half a hex; keep them
        # water when the centre is sea and the hex is mostly at or below sea level in ETOPO1.
        tidal = kinds[0] == "sea" and m_all is not None and (m_all <= 0 or sea_share(i) >= TIDAL_SEA_SHARE)
        if len(land) * 2 > len(kinds) and not tidal:
            us = [k for k in land if k >= 0]
            n_foreign = len(land) - len(us)
            if len(us) > n_foreign or (len(us) == n_foreign and kinds[0] != FOREIGN):
                owner[i] = majority(us, kinds[0])
            else:
                owner[i] = FOREIGN
            water[i] = LAND
        else:
            wet = [k for k in kinds if isinstance(k, str)]
            # Points in neither the lake nor the land outlines are usually sea, but next to a lake they are
            # mostly gaps between the two datasets' shorelines, so a lake hex needs only to be above sea level.
            above_sea = m_all is not None and m_all > 0
            lakeish = "lake" in wet and (above_sea or majority(wet, kinds[0] if kinds[0] in wet else "lake") == "lake")
            water[i] = LAKE if lakeish else OCEAN

    # Sliver fix: Census (1:20M) and Natural Earth (1:50m) outlines don't meet exactly, leaving water hexes
    # on land along the 49th parallel and the Rio Grande. A non-lake water hex whose ETOPO mean is above sea
    # level becomes land if at least 4 of its neighbours are land, or if it touches both US and foreign land.
    # It takes its land neighbours' majority owner.
    slivers = []
    for i in range(grid.size):
        if water[i] != OCEAN:
            continue
        m, _ = mean_std(stats_all[i])
        land_nb = [owner[j] for j in grid.neighbours(i) if water[j] == LAND]
        border = FOREIGN in land_nb and any(o >= 0 for o in land_nb)
        if m is not None and m > 0 and sea_share(i) < TIDAL_SEA_SHARE and (len(land_nb) >= 4 or border):
            slivers.append((i, Counter(land_nb).most_common(1)[0][0]))
    for i, o in slivers:
        owner[i], water[i] = o, LAND
    print(f"    {len(slivers)} sliver water hexes turned into land: {[i for i, _ in slivers]}")

    # --- counties for US cells -------------------------------------------------------------------
    county = [-1] * grid.size
    county_samples: list[list[int]] = [[] for _ in range(grid.size)]
    for i in range(grid.size):
        if owner[i] >= 0:
            cx, cy = grid.center(*grid.col_row(i))
            county_samples[i] = [county_idx.locate(cx + dx, cy + dy) for dx, dy in offsets]
    # Hexes whose seven points all miss the county polygons (e.g. reclaimed slivers) borrow the most
    # common county of their same-state neighbours for the centre sample.
    borrowed = 0
    for i in range(grid.size):
        smp = county_samples[i]
        if smp and max(smp) < 0:
            nb = [k for j in grid.neighbours(i) if owner[j] == owner[i] for k in county_samples[j] if k >= 0]
            if nb:
                smp[0] = Counter(nb).most_common(1)[0][0]
                borrowed += 1
    # The hex's county must lie in its owner state (majority ownership can differ from the centre point):
    # the centre if it does, else the most common in-state sample, else any sample. county_samples keep
    # every point, so lenses still area-weight across state lines.
    county_state = [c["state_fips"] for c in counties]
    off_state = 0
    for i, smp in enumerate(county_samples):
        valid = [k for k in smp if k >= 0]
        if not valid:
            continue
        same = [k for k in valid if county_state[k] == states[owner[i]]["fips"]]
        pool = same or valid
        county[i] = smp[0] if smp[0] in pool else Counter(pool).most_common(1)[0][0]
        off_state += not same
    print(f"    {borrowed} US hexes borrowed a neighbour's county; {off_state} have no county in their own state")

    # --- elevation, water depth classes and relief -------------------------------------------------
    elev = [0] * grid.size
    relief = [FLAT] * grid.size
    elev_max = [0] * grid.size  # highest land sample (m): snow on high ranges whose mean is held down by valleys
    valley_floor = 0
    no_elev = 0
    for i in range(grid.size):
        if water[i] == LAND:
            m, sd = mean_std(stats_land[i])
            if m is None:
                m, sd = mean_std(stats_all[i])
                m = None if m is None else max(m, 0.0)
            if m is None:
                no_elev += 1
                continue  # elev 0, flat
            elev[i] = round(m)
            relief[i] = classify_relief(max(m, 0.0), sd)
            if relief[i] in (HILLS, MOUNTAINS) and is_valley_floor(samples_land[i]):
                relief[i] -= 1  # mostly flat lowland with a range at one edge (the Central Valley's rim)
                valley_floor += 1
            if samples_land[i]:
                elev_max[i] = max(0, round(max(samples_land[i])))
        else:
            m, _ = mean_std(stats_all[i])
            if m is None:
                no_elev += 1
                elev[i] = -4000  # outside the elevation window: assume deep ocean
            elif water[i] != LAKE and below_sea[i]:
                elev[i] = round(below_sum[i] / below_sea[i])  # sea: mean depth of the samples under water
            else:
                elev[i] = min(round(m), 0)
            if water[i] == OCEAN:
                near_land = any(water[j] == LAND for j in grid.neighbours(i))
                water[i] = COAST if near_land or elev[i] > COAST_DEPTH_M else OCEAN
    print(f"    {no_elev} hexes without elevation samples; {valley_floor} valley-floor hexes eased one relief class")

    # --- land cover from NLCD --------------------------------------------------------------------
    lonlat = nlcd.get("crs") == "lonlat"  # WorldCover: a lon/lat grid; NLCD: EPSG:5070 metres
    albers = None if lonlat else AlbersEllipsoid()
    rows, legend = nlcd["rows"], nlcd["legend"]
    x0, dx, y0, dy = nlcd["x0"], nlcd["dx"], nlcd["y0"], nlcd["dy"]
    ncols, nrows = nlcd["cols"], len(rows)
    lattice = hex_lattice(HEX_RADIUS_KM, NLCD_STEP_KM)
    cover = [0] * grid.size
    pct = {k: [0] * grid.size for k in PCT}
    no_cover = 0
    for i in range(grid.size):
        if owner[i] < 0:
            continue
        cx, cy = grid.center(*grid.col_row(i))
        counts: Counter = Counter()
        for ox, oy in lattice:
            ex, ey = proj.inverse(cx + ox, cy + oy) if lonlat else albers(*proj.inverse(cx + ox, cy + oy))
            c, r = round((ex - x0) / dx), round((ey - y0) / dy)
            if 0 <= c < ncols and 0 <= r < nrows:
                counts[rows[r][c]] += 1
        counts = Counter({legend[ch]: n for ch, n in counts.items()})
        land = sum(n for code, n in counts.items() if code not in (0, 11))
        cover[i] = dominant_cover(counts, land)
        if not land:
            no_cover += 1
            continue
        for k, codes in PCT.items():
            pct[k][i] = round(100 * sum(counts[c] for c in codes) / land)
    print(f"    {len(lattice)} NLCD points per hex; {no_cover} US hexes without land-cover samples")

    # --- rivers ----------------------------------------------------------------------------------
    # Lake centerlines are kept only where they cross land hexes (reservoirs narrower than half a hex,
    # e.g. Lake Sakakawea or Lake Mead), so rivers don't stop in the middle of land; over water hexes they go.
    def on_land(pt):
        c = grid.cell_at(*pt)
        return c >= 0 and water[c] == LAND

    by_river: dict[tuple, list] = {}
    for r in ne["rivers"]:
        if r["rank"] > 8:
            continue
        line = [proj(lon, lat) for lon, lat in r["line"]]
        if (r.get("featurecla") or "").startswith("Lake Centerline"):
            parts = [run for p in clip_polyline(line, width, height) for run in land_runs(p, on_land)]
        else:
            parts = clip_polyline(line, width, height)
        by_river.setdefault((r["name"], r["rank"]), []).extend(parts)
    rivers = []
    for (name, rank), parts in by_river.items():
        for piece in join_lines(parts):
            if sum(math.dist(a, b) for a, b in zip(piece, piece[1:])) < 1.0:
                continue  # a corner clipped down to nothing
            pts = simplify(piece, 4.0)
            if len(pts) >= 2:
                rivers.append({"name": name, "rank": rank, "pts": [round(v, 1) for p in pts for v in p]})

    cover_table = [{"id": 0, "key": "none", "name": "Nenhuma", "rule": "Água, terra estrangeira ou sem amostras de terra na cobertura do solo."}] + [
        {"id": cid, "key": key, "name": name, "color": color, "nlcd": codes, "rule": rule}
        for cid, key, name, color, codes, rule in COVER
    ]
    tables = {
        "water": WATER_TABLE,
        "relief": RELIEF_TABLE,
        "cover": cover_table,
        "notes": {"water": WATER_NOTE, "relief": RELIEF_NOTE, "cover": COVER_NOTE},
    }
    states_out = [{"fips": s["fips"], "abbr": s["abbr"], "name": s["name"]} for s in states]
    write_web(
        "world.json",
        {
            "version": 2,
            "grid": grid.to_dict(),
            "width": round(width, 1),
            "height": round(height, 1),
            "margin": MARGIN_KM,
            "projection": proj.to_dict(),
            "owner": owner,
            "county": county,
            "elev": elev,
            "elev_max": elev_max,
            "water": water,
            "relief": relief,
            "cover": cover,
            "pct": pct,
            "tables": tables,
            "states": states_out,
            "counties": [{"geoid": c["geoid"], "name": c["name"]} for c in counties],
            "rivers": rivers,
        },
    )
    save_interim(
        "_world",
        {
            "grid": grid.to_dict(),
            "projection": proj.to_dict(),
            "owner": owner,
            "county": county,
            "county_samples": county_samples,
            "states": [s["fips"] for s in states],
            "counties": [c["geoid"] for c in counties],
            "water": water,
            "cover": cover,
            "pct": pct,
        },
    )
