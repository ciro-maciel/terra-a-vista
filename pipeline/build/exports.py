"""Exportação: quanto cada município, cidade e estado vendeu ao exterior em dólares, para onde e o quê (Comex Stat).

Os municípios do Comex Stat vêm como "Nome - UF" e casam com o código do IBGE pelo nome sem acento e a UF. Os países
vêm pelo nome em português e casam com o ponto do rótulo do Natural Earth (para as setas do mapa), com alguns
apelidos onde os nomes diferem.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

from ..core.paths import WEB_DATA
from ..core.store import load_interim, write_web
from ..sources.comex_stat import norm

REQUIRES = ["comex_stat", "natural_earth", "ibge_boundaries", "ibge_census", "ibge_localities", "cities.json"]
PRODUCES = ["exports.json"]
TOP_COUNTRIES, TOP_PRODUCTS = 10, 8

RULE = ("Valor FOB em dólares das exportações do ano, pelo município da empresa exportadora (o domicílio fiscal, não "
        "sempre onde a mercadoria foi produzida ou extraída: uma trading de São Paulo que vende soja de Mato Grosso conta "
        "em São Paulo, e um porto conta o que as empresas sediadas nele embarcam). Cidades e estados somam os seus "
        "municípios. Fonte: Secex/MDIC, Comex Stat.")

# Comex Stat name → Natural Earth NAME_PT, where they differ
ALIAS = {
    "paisesbaixosholanda": "paisesbaixos", "coreiadosulrepublica": "coreiadosul", "chinahongkong": "hongkong",
    "taiwanformosa": "taiwan", "vietna": "vietname", "barein": "bahrein", "belarus": "bielorrussia", "benin": "benim",
    "bosniaherzegovina": "bosniaeherzegovina", "congo": "republicadocongo",
    "congorepublicademocratica": "republicademocraticadocongo", "coveitekuweit": "kuwait", "djibuti": "djibouti",
    "ira": "irao", "mianmar": "myanmar", "malavi": "malawi", "macedonia": "macedoniadonorte", "irlanda": "republicadairlanda",
    "coreiadonorte": "coreiadonorte", "caymanilhas": "ilhascaimao", "falklandmalvinas": "ilhasmalvinas",
}
# places Natural Earth 1:50m folds into another country (overseas France) or lacks: [lon, lat]
EXTRA = {
    "guianafrancesa": [-53.1, 3.9], "guadalupe": [-61.55, 16.25], "martinica": [-61.0, 14.65],
    "gibraltar": [-5.35, 36.14], "tchequia": [15.3, 49.8], "tchecarepublica": [15.3, 49.8], "reuniao": [55.5, -21.1],
    "mauricio": [57.55, -20.3], "saobartolomeu": [-62.85, 17.9], "turcasecaicosilhas": [-71.8, 21.8],
    "turcomenistao": [59.0, 39.0], "marshallilhas": [171.2, 7.1], "virgensilhasamericanas": [-64.8, 18.3],
}


SHORT = {  # the SH4 headings are legal text; the map shows these
    "2709": "Petróleo bruto", "1201": "Soja", "2601": "Minério de ferro", "0901": "Café", "0202": "Carne bovina",
    "1701": "Açúcar", "1005": "Milho", "4703": "Celulose", "0207": "Carne de frango", "2304": "Farelo de soja",
    "5201": "Algodão", "2710": "Derivados de petróleo", "7108": "Ouro", "2603": "Minério de cobre", "8802": "Aviões",
    "0203": "Carne suína", "2401": "Fumo", "1507": "Óleo de soja", "7207": "Aço semiacabado", "2009": "Suco de fruta",
    "4407": "Madeira serrada", "8703": "Automóveis", "2208": "Álcool e bebidas", "2207": "Etanol", "8429": "Máquinas de terraplenagem",
    "2606": "Minério de alumínio", "7601": "Alumínio", "7202": "Ferroligas", "1006": "Arroz", "0206": "Miúdos de carne",
    "4101": "Couro bruto", "8708": "Autopeças", "1801": "Cacau", "0805": "Citros", "0804": "Frutas tropicais",
}


def short_name(code: str, text: str) -> str:
    if code in SHORT:
        return SHORT[code]
    cut = min([i for i in (text.find(";"), text.find(","), text.find(" (")) if i > 0] or [len(text)])
    return text[:cut].strip()[:48]


def bearing(lon0: float, lat0: float, lon1: float, lat1: float) -> int:
    """Initial great-circle bearing from (lon0, lat0) to (lon1, lat1), degrees clockwise from north."""
    p0, p1, dl = math.radians(lat0), math.radians(lat1), math.radians(lon1 - lon0)
    x = math.sin(dl) * math.cos(p1)
    y = math.cos(p0) * math.sin(p1) - math.sin(p0) * math.cos(p1) * math.cos(dl)
    return round(math.degrees(math.atan2(x, y))) % 360


def top(d: dict, n: int) -> list:
    return [[k, v] for k, v in sorted(d.items(), key=lambda kv: -kv[1])[:n] if v > 0]


def add(into: dict, d: dict) -> None:
    for k, v in d.items():
        into[k] = into.get(k, 0) + v


def build() -> None:
    cx = load_interim("comex_stat")
    labels = load_interim("natural_earth")["labels"]
    bounds = load_interim("ibge_boundaries")
    pop = load_interim("ibge_census")["municipalities"]
    cities = json.loads((WEB_DATA / "cities.json").read_text())
    abbr = {s["fips"]: s["abbr"] for s in bounds["states"]}
    by_name = {f"{abbr.get(m['geoid'][:2])}|{norm(m['name'])}": m["geoid"] for m in bounds["counties"]}

    munis, lost = {}, 0
    for key, f in cx["municipalities"].items():
        code = by_name.get(key)
        if not code:
            lost += sum(f["country"].values())
            continue
        munis[code] = f
    total = sum(sum(f["country"].values()) for f in cx["municipalities"].values())
    print(f"    {len(munis)} municipalities matched; unmatched US$ {lost / 1e9:.2f} bi of {total / 1e9:.1f} bi "
          "(no municipality: 'Não declarada', bunkers, other)")

    ne = {norm(v[2]): (iso, v) for iso, v in labels.items()}
    def place(name):
        k = norm(name)
        if k in EXTRA:
            return {"iso3": None, "lon": EXTRA[k][0], "lat": EXTRA[k][1]}
        hit = ne.get(ALIAS.get(k, k))
        return None if not hit else {"iso3": hit[0], "lon": hit[1][0], "lat": hit[1][1]}

    def summary(codes):
        c, p = {}, {}
        for code in codes:
            f = munis.get(code)
            if f:
                add(c, f["country"])
                add(p, f["heading"])
        fob = sum(c.values())
        return {"fob": fob, "countries": top(c, TOP_COUNTRIES), "products": top(p, TOP_PRODUCTS)} if fob else None

    all_codes = [m["geoid"] for m in bounds["counties"]]
    nation = {"fob": total, **{k: v for k, v in summary(all_codes).items() if k != "fob"}}
    nc, np_ = {}, {}
    for f in cx["municipalities"].values():
        add(nc, f["country"])
        add(np_, f["heading"])
    nation["countries"], nation["products"] = top(nc, 15), top(np_, 12)
    states = {abbr[s["fips"]]: summary([c for c in all_codes if c[:2] == s["fips"]]) for s in bounds["states"]}
    out_cities = {c["id"]: s for c in cities if (s := summary(c["counties"]))}

    used = {k for blob in [nation, *states.values(), *out_cities.values()] if blob for k, _ in blob["countries"]}
    countries = {n: place(n) for n in sorted(used)}
    # Each destination gets the compass bearing from where the arrow starts: the city's principal seat, the state's
    # most populous municipality, Brasília for the nation.
    seats = load_interim("ibge_localities")["seats"]
    def aim(blob, code):
        s0 = seats.get(code)
        if not blob or not s0:
            return
        for row in blob["countries"]:
            c = countries.get(row[0])
            row.append(bearing(s0["lon"], s0["lat"], c["lon"], c["lat"]) if c else None)
    aim(nation, "5300108")
    for st in bounds["states"]:
        members = [c for c in all_codes if c[:2] == st["fips"]]
        aim(states[abbr[st["fips"]]], max(members, key=lambda c: pop.get(c) or 0))
    for c in cities:
        aim(out_cities.get(c["id"]), c["id"])
    missing = sorted(n for n, v in countries.items() if v is None)
    if missing:
        print(f"    countries without a map point ({len(missing)}): {', '.join(missing[:12])}")
    used_p = {k for blob in [nation, *states.values(), *out_cities.values()] if blob for k, _ in blob["products"]}
    write_web("exports.json", {
        "version": 1, "year": cx["year"], "vintage": cx.get("vintage"), "sources": ["comex_stat"], "rule": RULE,
        "unit": "US$ FOB", "unmatched_fob": lost,
        "countries": {k: v for k, v in countries.items() if v},
        "products": {k: short_name(k, cx["products"].get(k, k)) for k in sorted(used_p)},
        "nation": nation, "states": states, "cities": out_cities,
        "munis": {code: [sum(f["country"].values()), pop.get(code)] for code, f in munis.items()},
    })


def check(web_dir) -> list[tuple[str, str]]:
    p = Path(web_dir) / "exports.json"
    if not p.exists():
        return [("NOTE", "exports.json: missing (optional, skipped)")]
    d = json.loads(p.read_text())
    share = d["unmatched_fob"] / d["nation"]["fob"]
    if share > 0.05:
        return [("FAIL", f"exports.json: {share:.1%} of the exports did not match a municipality")]
    return [("PASS", f"exports.json: {len(d['munis'])} municipalities, US$ {d['nation']['fob'] / 1e9:.0f} bi, "
                     f"{share:.1%} without a municipality")]
