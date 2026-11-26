"""Série do IDH (Atlas do Desenvolvimento Humano): o IDHM e as suas três dimensões em 1991, 2000 e 2010."""

from __future__ import annotations

from ..core.store import load_interim
from .series_util import build_series, check_series

REQUIRES = ["ipea_idhm", "ibge_history", "ibge_census", "_world", "ibge_boundaries", "cities.json"]
PRODUCES = ["series_idhm.json"]

RULE = ("Índice de Desenvolvimento Humano Municipal, de 0 a 1 (PNUD, Ipea e Fundação João Pinheiro), com os Censos de "
        "1991, 2000 e 2010, todos nos limites municipais de 2010. Educação junta a escolaridade dos adultos e o fluxo "
        "escolar dos jovens; longevidade é a esperança de vida ao nascer; renda é a renda per capita. Estados e Brasil "
        "usam o valor oficial do Atlas; uma cidade de vários municípios é a média deles ponderada pela população de cada "
        "Censo. O IDHM municipal com o Censo 2022 não está na base pública do Ipeadata.")

METRICS = [
    ("idhm", "IDHM", "O índice: a média geométrica das três dimensões."),
    ("education", "Educação", "Escolaridade da população adulta e fluxo escolar dos jovens."),
    ("longevity", "Longevidade", "Esperança de vida ao nascer, em índice."),
    ("income", "Renda", "Renda per capita, em índice (escala logarítmica)."),
]


def build() -> None:
    d = load_interim("ipea_idhm")
    years = d["years"]
    hist = load_interim("ibge_history")["municipalities"]["population"]
    abbr = {s["fips"]: s["abbr"] for s in load_interim("ibge_boundaries")["states"]}
    metrics = []
    for key, name, desc in METRICS:
        mun = d["municipalities"][key]
        num = {c: {y: (v * (hist.get(c) or {}).get(y, 0) if v is not None and (hist.get(c) or {}).get(y) else None)
                   for y, v in ys.items()} for c, ys in mun.items()}
        den = {c: {y: ((hist.get(c) or {}).get(y) if v is not None and (hist.get(c) or {}).get(y) else None)
                   for y, v in ys.items()} for c, ys in mun.items()}
        # a municipality's own value (not num/den), so the map shows exactly the Atlas number
        st = {abbr.get(code): ys for code, ys in d["states"][key].items() if abbr.get(code)}
        nat = next(iter(d["nation"][key].values()))
        metrics.append({"id": key, "name": name, "unit": "de 0 a 1", "format": "float", "ramp": "teal" if key == "idhm" else "blue",
                        "higher_is": "good", "digits": 3, "description": desc, "num": num, "den": den, "domain": [0.3, 0.85],
                        "states_official": st, "nation_official": nat})
    build_series({"id": "idhm", "name": "IDH", "vintage": d.get("vintage") or "Atlas do Desenvolvimento Humano",
                  "sources": ["ipea_idhm"], "years": years, "rule": RULE, "fixed_borders": True,
                  "question": "Como o desenvolvimento humano mudou de 1991 a 2010?", "movers_min_pop": 10000}, metrics)


def check(web_dir):
    return check_series(web_dir, "idhm")
