"""Distritos: a especialização real do emprego (IBGE CEMPRE) como distritos de jogo de estratégia, por cidade.

Os empregos de uma cidade numa atividade são a soma dos seus municípios (cities.json `counties`). Uma célula que o
IBGE suprime (poucos informantes) fica fora da soma, e o valor vira um piso (`suppressed` conta quantas,
`lower_bound` marca); sem nenhum município divulgado, o valor é nulo, nunca 0.

Quociente locacional (QL) = (empregos da cidade nas atividades do distrito ÷ todos os empregos da cidade) ÷ (a
mesma razão no país). Todos os empregos = o total do CEMPRE (pessoal ocupado assalariado).

A regra (publicada no arquivo como `rule`):
* A nota de um distrito é o QL da soma das suas atividades (`naics`: códigos da CNAE 2.0, seção, divisão ou grupo).
* Ele **aparece** quando esse QL é de pelo menos MIN_LQ e soma pelo menos MIN_JOBS empregos ou MIN_SHARE dos
  empregos da cidade ("amplo"), ou quando uma das suas especialidades (`sub`) tem QL de pelo menos SPECIALTY_LQ com
  pelo menos SPECIALTY_JOBS empregos ou SPECIALTY_SHARE dos empregos da cidade, e nunca abaixo de MIN_JOBS.
* Os distritos se ordenam pela força = empregos acima da norma nacional (emp - emp / QL); ficam até MAX_PER_CITY.
  O Porto também precisa de um hexágono da cidade na água, ao lado dela, ou sobre um rio do mapa.
* O tipo de cidade (`badge`) vem do distrito mais forte, a não ser que outro seja extremo (QL >= BADGE_LQ e >=
  BADGE_SHARE dos empregos, no distrito ou numa especialidade dele: Macaé e o petróleo), e então o mais forte
  desses vence. O rótulo é o apelido da especialidade quando ela
  passa, senão o apelido do distrito. Sem distrito, sem tipo ("diversificada").
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from ..core.hexgrid import HexGrid
from ..core.paths import WEB_DATA
from ..core.store import load_interim, load_interim_payload, write_web

REQUIRES = ["ibge_cempre", "_world", "cities.json", "world.json"]
PRODUCES = ["districts.json"]

MIN_LQ = 1.25
MIN_JOBS = 1000
MIN_SHARE = 0.01
SPECIALTY_LQ = 3.0
SPECIALTY_JOBS = 5000      # a speciality alone makes a district only when it is a real share of the city:
SPECIALTY_SHARE = 0.005    # at least this many jobs, or this share of the city's jobs
MAX_PER_CITY = 5
TOP_INDUSTRIES = 8
ALL_OWN = [1]              # CEMPRE has no ownership split: one "ownership", all employers
BADGE_LQ = 6.0
BADGE_SHARE = 0.03


def _n(x) -> str:
    """Brazilian thousands separator for the rule text."""
    return f"{x:,}".replace(",", ".")


RULE_TEXT = (
    f"Um distrito aparece quando os empregos formais nas suas atividades têm quociente locacional (a parcela desses "
    f"empregos na cidade dividida pela parcela no país) de pelo menos {MIN_LQ:g} e somam pelo menos {_n(MIN_JOBS)} ou "
    f"{MIN_SHARE:.0%} dos empregos da cidade, ou quando uma das suas especialidades tem quociente de pelo menos "
    f"{SPECIALTY_LQ:g} com pelo menos {_n(SPECIALTY_JOBS)} empregos ou {SPECIALTY_SHARE:.1%} dos empregos da cidade "
    f"(e nunca menos de {_n(MIN_JOBS)}). Os distritos se ordenam por quantos empregos têm acima da norma nacional; até "
    f"{MAX_PER_CITY} por cidade. O Porto também precisa de um hexágono da cidade na água, ao lado dela ou sobre um rio "
    f"do mapa. Os empregos da cidade somam os seus municípios; células que o IBGE suprime ficam de fora, e esses "
    f"valores são pisos. O tipo de cidade leva o nome do distrito mais forte, ou de um distrito com quociente de "
    f"pelo menos {BADGE_LQ:g} e pelo menos {BADGE_SHARE:.0%} dos empregos (no distrito ou numa especialidade dele) "
    f"quando houver, e o apelido da especialidade "
    f"quando ela passa; 'Capital federal' e 'Capital estadual' só vão para cidades com a capital. Fonte: IBGE, "
    f"Cadastro Central de Empresas (emprego assalariado formal; o trabalho informal fica de fora)."
).replace(".0%", "%").replace("0.5%", "0,5%")


def _d(id, name, color, naics, sub, badge, labels, description, caveat=None, icon=None):
    return {
        "id": id, "name": name, "icon": icon or "d-" + id.replace("_", "-"), "color": color, "naics": naics,
        "own": ALL_OWN, "sub": sub, "badge": {"id": badge[0], "label": badge[1], "labels": labels},
        "description": description, "caveat": caveat,
    }


CATALOG = [
    _d("campus", "Campus", "#4a7bd0", ["62", "63", "72", "85.3"],
       {"72.1": "Pesquisa científica", "85.3": "Universidades", "62.0": "Software e TI"},
       ("scientific", "Cidade do conhecimento"),
       {"72.1": "Cidade da pesquisa", "85.3": "Cidade universitária", "62.0": "Polo de tecnologia"},
       "Ciência e tecnologia: software e serviços de TI, serviços de informação, pesquisa e desenvolvimento e "
       "educação superior."),
    _d("commercial_hub", "Centro financeiro", "#d0a23a", ["64", "65", "66"],
       {"64": "Bancos", "65": "Seguros e previdência"},
       ("commercial", "Centro financeiro"), {"64": "Capital financeira", "65": "Cidade dos seguros"},
       "Finanças e seguros: bancos, crédito, seguradoras, previdência e mercado de capitais."),
    _d("industrial_zone", "Zona industrial", "#c2643a", ["B", "C"],
       {"29.1": "Automóveis", "24.2": "Siderurgia", "24.1": "Ferro-gusa", "19.2": "Refino de petróleo",
        "06.0": "Petróleo e gás", "07.1": "Minério de ferro", "15.3": "Calçados", "21": "Farmacêutica"},
       ("industrial", "Cidade industrial"),
       {"29.1": "Cidade do automóvel", "24.2": "Cidade do aço", "24.1": "Cidade do aço", "19.2": "Cidade da refinaria",
        "06.0": "Cidade do petróleo", "07.1": "Cidade do minério", "15.3": "Polo calçadista", "21": "Polo farmacêutico"},
       "Indústria de transformação e indústrias extrativas (petróleo, gás e mineração)."),
    _d("agro", "Agro", "#9bb04a", ["A", "46.2", "10.1"],
       {"01": "Lavouras e pecuária", "46.2": "Comércio de grãos e insumos", "10.1": "Frigoríficos"},
       ("agrarian", "Cidade do agro"),
       {"01": "Cidade do agro", "46.2": "Cidade do agro", "10.1": "Cidade dos frigoríficos"},
       "A cadeia do agronegócio: agropecuária e produção florestal, comércio atacadista de matérias-primas "
       "agrícolas (grãos, insumos) e abate e frigoríficos.",
       "Só emprego formal: no campo, a informalidade é maior que na média.", icon="l-farmland"),
    _d("harbor", "Porto", "#2f8fb0", ["50", "52.3"],
       {"50.1": "Navegação", "52.3": "Serviços portuários"},
       ("maritime", "Cidade portuária"), {"50.1": "Cidade portuária", "52.3": "Cidade portuária"},
       "Transporte aquaviário: navegação de cabotagem e longo curso, e serviços portuários (operação de terminais, "
       "praticagem).", "Só para cidades com um hexágono na água, ao lado dela ou sobre um rio do mapa."),
    _d("theater_square", "Praça das artes", "#a15bc4", ["90", "59", "60"],
       {"90": "Artes e espetáculos", "59": "Cinema, vídeo e música", "60": "Rádio e televisão"},
       ("cultural", "Cidade das artes"), {"90": "Cidade das artes", "59": "Cidade do audiovisual", "60": "Cidade da mídia"},
       "Cultura e mídia: artes cênicas e espetáculos, cinema, vídeo e música, rádio e televisão."),
    _d("entertainment_complex", "Complexo de lazer", "#d0508a", ["93", "55"],
       {"93.2": "Recreação e lazer", "93.1": "Esportes", "55": "Hotéis e pousadas"},
       ("entertainment", "Cidade turística"),
       {"93.2": "Cidade turística", "93.1": "Cidade do esporte", "55": "Cidade turística"},
       "Lazer: parques, clubes, academias e esportes, mais hotéis e pousadas."),
    _d("aerodrome", "Aeródromo", "#6a8fb8", ["51", "52.4", "30.4"],
       {"51": "Companhias aéreas", "52.4": "Serviços aeroportuários", "30.4": "Aeronaves"},
       ("aviation", "Polo aéreo"), {"51": "Polo aéreo", "52.4": "Polo aéreo", "30.4": "Cidade aeroespacial"},
       "Aviação: companhias aéreas, serviços aeroportuários e fabricação de aeronaves."),
    _d("government_plaza", "Praça do governo", "#8a9a5b", ["84"],
       {"84.1": "Administração do Estado"},
       ("governmental", "Cidade do governo"), {"84.1": "Cidade do governo"},
       "Administração pública, defesa e seguridade social, nas três esferas.",
       "Inclui as prefeituras, que existem em todo município; universidades e hospitais públicos ficam no Campus e na saúde."),
    _d("aqueduct", "Usina e saneamento", "#3aa0a0", ["D", "E"],
       {"35.1": "Energia elétrica", "36.0": "Água"},
       ("utility", "Cidade da energia"), {"35.1": "Cidade da energia", "36.0": "Cidade do saneamento"},
       "Serviços públicos: geração e distribuição de energia elétrica e gás, água, esgoto e resíduos."),
]
BY_ID = {d["id"]: d for d in CATALOG}
IDS = [d["id"] for d in CATALOG]


class Metrics:
    """Adds up CEMPRE municipal entries for a set of municipalities (the upstream QCEW layout)."""

    def __init__(self, q: dict):
        self.q = q
        self.owns = q["owns"]
        us_emp, us_wages, _ = q["us_total"]
        self.us_emp, self.us_wages = us_emp, us_wages

    def total(self, fips: list[str]) -> dict:
        emp = wages = 0
        known = 0
        has_wages = True
        for f in fips:
            e = self.q["totals"].get(f)
            if e:
                emp += e[0]
                if e[1] is None:
                    has_wages = False
                else:
                    wages += e[1]
                known += 1
        return {"emp": emp if known else None, "wages": wages if known and has_wages else None, "known": known}

    def industry(self, codes: list[str], own: list[int], fips: list[str]) -> dict:
        """{emp, wages, chg, suppressed} over municipalities; emp None when none disclosed anything."""
        emp = wages = chg = 0
        has_wages = True
        suppressed = 0
        disclosed = 0
        for f in fips:
            sup = False
            for c in codes:
                row = self.q["counties"].get(c, {}).get(f)
                if row is None:
                    continue  # no local unit in this activity: 0 jobs
                for o in own:
                    e = row[self.owns.index(o)]
                    if e is None:
                        sup = True
                    elif e:
                        emp += e[0]
                        if e[1] is None:
                            has_wages = False
                        else:
                            wages += e[1]
                        chg += e[2]
            if sup:
                suppressed += 1
            else:
                disclosed += 1
        if disclosed == 0 and suppressed > 0 and emp == 0:
            return {"emp": None, "wages": None, "chg": None, "suppressed": suppressed}
        return {"emp": emp, "wages": wages if has_wages else None, "chg": chg, "suppressed": suppressed}

    def us(self, codes: list[str], own: list[int]) -> int:
        n = 0
        for c in codes:
            for o in own:
                e = self.q["us"][c][self.owns.index(o)]
                if e:
                    n += e[0]
        return n


def _r(x, nd=3):
    return None if x is None else round(x, nd)


def lq(emp, total, us_emp, us_total):
    if emp is None or not total or not us_emp or not us_total:
        return None
    return (emp / total) / (us_emp / us_total)


def excess(emp, q) -> float:
    """Jobs above the national norm: emp - emp / LQ (0 when LQ <= 1)."""
    return emp * (1 - 1 / q) if emp and q and q > 1 else 0.0


def evaluate(m: Metrics, fips: list[str], total: int | None, wet: bool = True) -> list[dict]:
    """Every district that passes the rule for this set of municipalities, strongest first (max MAX_PER_CITY)."""
    out = []
    if not total:
        return out
    for d in CATALOG:
        if d["id"] == "harbor" and not wet:
            continue
        v = m.industry(d["naics"], d["own"], fips)
        if v["emp"] is None:
            continue
        dlq = lq(v["emp"], total, m.us(d["naics"], d["own"]), m.us_emp)
        share = v["emp"] / total
        broad = dlq is not None and dlq >= MIN_LQ and (v["emp"] >= MIN_JOBS or share >= MIN_SHARE)
        subs = []
        for code in d["sub"]:
            s = m.industry([code], d["own"], fips)
            if s["emp"] is None or s["emp"] < MIN_JOBS:
                continue
            slq = lq(s["emp"], total, m.us([code], d["own"]), m.us_emp)
            if slq is not None and slq > 1:
                subs.append((code, slq, s["emp"], excess(s["emp"], slq), s["suppressed"] > 0))
        special = [x for x in subs if x[1] >= SPECIALTY_LQ
                   and (x[2] >= SPECIALTY_JOBS or x[2] >= SPECIALTY_SHARE * total)]
        best_sub = max(special or subs, key=lambda x: x[3], default=None)
        specialty = bool(special)
        if not (broad or specialty):
            continue
        strength = max(excess(v["emp"], dlq) if broad else 0, best_sub[3] if specialty else 0)
        out.append({
            "id": d["id"], "lq": _r(dlq, 2), "emp": v["emp"], "share": _r(share, 4),
            "avg_pay": round(v["wages"] / v["emp"]) if v["emp"] and v["wages"] is not None else None,
            "sub": best_sub[0] if best_sub else None, "sub_lq": _r(best_sub[1], 2) if best_sub else None,
            "sub_emp": best_sub[2] if best_sub else None,
            "sub_lower_bound": bool(best_sub[4]) if best_sub else None,
            "via": "broad" if broad else "specialty", "strength": round(strength),
            "suppressed": v["suppressed"], "lower_bound": v["suppressed"] > 0,
        })
    out.sort(key=lambda r: -r["strength"])
    return out[:MAX_PER_CITY]


def badge_district(dists: list[dict]) -> dict | None:
    """The district the city type is named after: the strongest, unless a listed district is extreme."""
    if not dists:
        return None
    def sub_share(d):
        return d["sub_emp"] * (d["share"] or 0) / d["emp"] if d.get("sub_emp") and d.get("emp") else 0

    extreme = [d for d in dists
               if (d["lq"] is not None and d["lq"] >= BADGE_LQ and (d["share"] or 0) >= BADGE_SHARE)
               or ((d.get("sub_lq") or 0) >= BADGE_LQ and sub_share(d) >= BADGE_SHARE)]
    return max(extreme, key=lambda d: d["strength"]) if extreme else dists[0]


# The 27 capitals (IBGE municipality codes); 'Capital estadual' goes only to cities holding one.
STATE_CAPITALS = {
    "1200401", "2704302", "1600303", "1302603", "2927408", "2304400", "3205309", "5208707", "2111300", "5103403",
    "5002704", "3106200", "1501402", "2507507", "4106902", "2611606", "2211001", "3304557", "2408102", "4314902",
    "1100205", "1400100", "4205407", "3550308", "2800308", "1721000",
}


def holds_state_capital(city: dict) -> bool:
    return bool(STATE_CAPITALS & set(city.get("counties") or []))


def _fmt(x: float) -> str:
    return f"{x:.1f}".replace(".", ",")


def badge_for(best: dict | None, capital: bool = False, state_capital: bool = False) -> dict | None:
    if not best:
        return None
    d = BY_ID[best["id"]]
    sub = best["sub"]
    use_sub = sub is not None and best["sub_lq"] is not None and best["sub_lq"] >= SPECIALTY_LQ
    label = d["badge"]["labels"].get(sub, d["badge"]["label"]) if use_sub else d["badge"]["label"]
    if capital and d["id"] == "government_plaza":
        label = "Capital federal"
    elif d["id"] == "government_plaza" and state_capital:
        label = "Capital estadual"
    if use_sub:
        ge = "≥ " if best.get("sub_lower_bound") else ""
        text = f"{d['sub'][sub]}: {ge}{_fmt(best['sub_lq'])}× a parcela nacional dos empregos"
    else:
        ge = "≥ " if best.get("lower_bound") else ""
        text = f"{d['name']}: {ge}{_fmt(best['lq'])}× a parcela nacional dos empregos"
    return {"id": d["badge"]["id"], "label": label, "district": d["id"], "text": text, "basis": "cempre"}


def wet_cities(cities: list[dict], world_i: dict, world: dict) -> set[str]:
    """Ids of cities with a footprint hex on or next to water, or on a mapped river."""
    grid = HexGrid(**world_i["grid"])
    water = world_i["water"]
    river_cells = set()
    for r in world.get("rivers") or []:
        pts = r.get("pts") or []
        for i in range(0, len(pts) - 2, 2):
            x0, y0, x1, y1 = pts[i], pts[i + 1], pts[i + 2], pts[i + 3]
            n = max(1, int(((x1 - x0) ** 2 + (y1 - y0) ** 2) ** 0.5 / 4))
            for k in range(n + 1):
                c = grid.cell_at(x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n)
                if c is not None and 0 <= c < len(water):
                    river_cells.add(c)
    out = set()
    for c in cities:
        cells = c.get("footprint") or ([c["cell"]] if c.get("cell") is not None else [])
        for cell in cells:
            if cell in river_cells or any(water[n] > 0 for n in [cell, *grid.neighbours(cell)]):
                out.add(c["id"])
                break
    return out


def build() -> None:
    payload = load_interim_payload("ibge_cempre")
    q = payload["data"]
    world_i = load_interim("_world")
    cities = json.loads((WEB_DATA / "cities.json").read_text())
    world = json.loads((WEB_DATA / "world.json").read_text())
    m = Metrics(q)
    titles = q["codes"]
    wet = wet_cities(cities, world_i, world)

    detail = [c for c in titles if re.fullmatch(r"\d{2}", c)]  # the 87 CNAE divisions
    industries = {}
    for c in titles:
        if c == "total" or c not in q["us"]:
            continue
        industries[c] = {"title": titles[c], "us_emp": m.us([c], ALL_OWN)}

    out_cities: dict[str, dict] = {}
    for c in cities:
        fips = c.get("counties") or []
        tot = m.total(fips)
        if tot["emp"] is None:
            out_cities[c["id"]] = None
            continue
        total = tot["emp"]
        top = []
        for code in detail:
            v = m.industry([code], ALL_OWN, fips)
            if v["emp"] is None or v["emp"] < MIN_JOBS:
                continue
            ilq = lq(v["emp"], total, industries[code]["us_emp"], m.us_emp)
            if ilq is None:
                continue
            top.append({
                "naics": code, "emp": v["emp"], "lq": _r(ilq, 2), "avg_pay": None, "oty_pct": None,
                "suppressed": v["suppressed"], "lower_bound": v["suppressed"] > 0,
            })
        top.sort(key=lambda r: -r["lq"])
        dists = evaluate(m, fips, total, c["id"] in wet)
        out_cities[c["id"]] = {
            "emp": total, "avg_pay": None,
            "counties": [tot["known"], len(fips)],
            "top": top[:TOP_INDUSTRIES],
            "districts": dists,
            "badge": badge_for(badge_district(dists), bool(c.get("capital")), holds_state_capital(c)),
        }

    catalog = [dict(d, naics=list(d["naics"])) for d in CATALOG]
    doc = {
        "version": 1,
        "vintage": payload.get("vintage") or q["vintage"],
        "year": q["year"],
        "sources": ["ibge_cempre"],
        "rule": {"min_lq": MIN_LQ, "min_jobs": MIN_JOBS, "min_share": MIN_SHARE, "specialty_lq": SPECIALTY_LQ,
                 "specialty_jobs": SPECIALTY_JOBS, "specialty_share": SPECIALTY_SHARE,
                 "max_per_city": MAX_PER_CITY, "harbor_needs_water": True, "badge_lq": BADGE_LQ,
                 "badge_share": BADGE_SHARE, "text": RULE_TEXT,
                 "county_note": "Só as cidades do mapa: os municípios fora delas não foram baixados."},
        "catalog": catalog,
        "industries": industries,
        "national": {"emp": m.us_emp, "avg_pay": None},
        "cities": out_cities,
        "counties": {},
    }
    write_web("districts.json", doc)
    badges = {}
    for row in out_cities.values():
        if row and row["badge"]:
            badges[row["badge"]["label"]] = badges.get(row["badge"]["label"], 0) + 1
    print(f"    {sum(1 for r in out_cities.values() if r)} cities with jobs; city types: "
          + ", ".join(f"{k} {v}" for k, v in sorted(badges.items(), key=lambda kv: -kv[1])))


# ---------------------------------------------------------------------------------------------- check


def check(web_dir: Path) -> list[tuple[str, str]]:
    web_dir = Path(web_dir)
    p = web_dir / "districts.json"
    if not p.exists():
        return [("NOTE", "districts.json: missing (optional, skipped)")]
    out: list[tuple[str, str]] = []
    bad = lambda m: out.append(("FAIL", f"districts.json: {m}"))  # noqa: E731
    try:
        doc = json.loads(p.read_text())
    except ValueError as exc:
        return [("FAIL", f"districts.json: invalid JSON ({exc})")]
    if not isinstance(doc, dict):
        return [("FAIL", "districts.json: top level is not an object")]
    for k in ("version", "vintage", "year", "sources", "rule", "catalog", "industries", "national", "cities", "counties"):
        if k not in doc:
            bad(f"missing key {k!r}")
    if out:
        return out
    sp = web_dir / "sources.json"
    if sp.exists() and isinstance(doc["sources"], list):
        try:
            known = {x.get("id") for x in json.loads(sp.read_text()) if isinstance(x, dict)}
        except (ValueError, AttributeError):
            known = None
        if known is not None and set(doc["sources"]) - known:
            out.append(("WARN", f"districts.json: sources missing from sources.json: {sorted(set(doc['sources']) - known)}"))
    if doc["version"] != 1:
        bad(f"version {doc['version']!r} != 1")
    if not isinstance(doc["sources"], list) or not doc["sources"]:
        bad("sources must be a non-empty list")
    if not isinstance(doc["rule"], dict) or not isinstance(doc["rule"].get("text"), str):
        bad("rule.text missing")
    cat = doc["catalog"]
    ids = [d.get("id") for d in cat] if isinstance(cat, list) else []
    if ids != IDS:
        bad(f"catalog ids {ids} != {IDS}")
    for d in cat if isinstance(cat, list) else []:
        for k in ("name", "icon", "color", "naics", "own", "sub", "badge", "description"):
            if k not in d:
                bad(f"catalog {d.get('id')}: missing {k!r}")
    industries = doc["industries"] if isinstance(doc["industries"], dict) else {}
    cities_path = web_dir / "cities.json"
    city_ids = None
    if cities_path.exists():
        try:
            city_ids = {c.get("id") for c in json.loads(cities_path.read_text()) if isinstance(c, dict)}
        except (ValueError, TypeError, AttributeError):
            city_ids = None
    cities = doc["cities"] if isinstance(doc["cities"], dict) else {}
    if city_ids is not None:
        missing = city_ids - set(cities)
        extra = set(cities) - city_ids
        if missing:
            bad(f"{len(missing)} cities.json ids missing, e.g. {sorted(missing)[:3]}")
        if extra:
            bad(f"{len(extra)} ids not in cities.json, e.g. {sorted(extra)[:3]}")
    n_null = n_badge = n_lower = 0
    counts = {i: 0 for i in IDS}
    for cid, row in cities.items():
        if row is None:
            n_null += 1
            continue
        if not isinstance(row.get("emp"), (int, float)) or row["emp"] <= 0:
            bad(f"city {cid}: emp must be a positive number")
        dl = row.get("districts")
        if not isinstance(dl, list) or len(dl) > MAX_PER_CITY:
            bad(f"city {cid}: districts must be a list of at most {MAX_PER_CITY}")
            continue
        for d in dl:
            if d.get("id") not in counts:
                bad(f"city {cid}: unknown district {d.get('id')!r}")
                continue
            counts[d["id"]] += 1
            if d.get("emp") is None or d["emp"] <= 0:
                bad(f"city {cid}: district {d['id']} without jobs")
            if d.get("lower_bound") != (d.get("suppressed", 0) > 0):
                bad(f"city {cid}: district {d['id']} lower_bound disagrees with suppressed")
            if d.get("lower_bound"):
                n_lower += 1
        for t in row.get("top") or []:
            if t.get("naics") not in industries:
                bad(f"city {cid}: top industry {t.get('naics')!r} not in industries")
        b = row.get("badge")
        if b is not None:
            n_badge += 1
            if b.get("basis") == "ipeds":
                if b.get("withheld") is not True or b.get("district") != "campus":
                    bad(f"city {cid}: an IPEDS badge must be a withheld Campus")
            elif not dl or b.get("district") not in {d.get("id") for d in dl}:
                bad(f"city {cid}: badge does not name one of its districts")
        elif dl:
            bad(f"city {cid}: districts but no badge")
    if any(lv == "FAIL" for lv, _ in out):
        return out
    out.append(("PASS", f"districts.json: {len(cities)} cities ({n_null} without CEMPRE data), {n_badge} with a city "
                        f"type, {len(doc['counties'])} counties"))
    out.append(("NOTE", "districts.json: cities per district: " + ", ".join(f"{k} {v}" for k, v in counts.items())))
    out.append(("NOTE", f"districts.json: {n_lower} city districts are lower bounds (suppressed municipalities left out)"))
    return out
