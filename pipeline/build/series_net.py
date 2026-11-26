"""Série da conexão (Anatel): banda larga fixa e celular por 100 habitantes desde 2019, e a parcela dos moradores
coberta por 4G (desde 2021) e 5G (desde 2022)."""

from __future__ import annotations

from ..core.store import load_interim
from .series_util import build_series, check_series

REQUIRES = ["anatel", "ibge_census", "_world", "ibge_boundaries", "cities.json"]
PRODUCES = ["series_net.json"]
YEARS = [str(y) for y in range(2019, 2026)]

RULE = ("Acessos de banda larga fixa e de celular em dezembro de cada ano (2025: novembro), por 100 habitantes, como a "
        "Anatel calcula; o acesso conta no município do endereço de cobrança, e uma pessoa pode ter mais de uma linha. "
        "Cobertura: a parcela dos moradores dentro da área em que alguma operadora oferece 4G ou 5G, no mês que o "
        "arquivo da Anatel traz para cada ano (cobertura declarada pelas operadoras, não medida no aparelho). Cidades e "
        "estados somam os acessos e ponderam a cobertura pela população do Censo 2022.")


def coverage(cov: dict, pop: dict) -> tuple[dict, dict]:
    num, den = {}, {}
    for code, ys in cov.items():
        p = pop.get(code)
        if not p:
            continue
        num[code] = {y: (v * p if v is not None else None) for y, v in ys.items()}
        den[code] = {y: (p if v is not None else None) for y, v in ys.items()}
    return num, den


def build() -> None:
    a = load_interim("anatel")
    pop = load_interim("ibge_census")["municipalities"]
    per100 = lambda d: {c: {y: (v / 100 if v else None) for y, v in ys.items()} for c, ys in d.items()}
    metrics = [
        {"id": "broadband", "name": "Banda larga", "unit": "acessos por 100 habitantes", "format": "float", "ramp": "blue",
         "higher_is": "good", "lo_floor": 0, "description": "Acessos de internet fixa (cabo, fibra, rádio, satélite).",
         "num": a["accesses"]["broadband"], "den": per100(a["base"]["broadband"])},
        {"id": "mobile", "name": "Celular", "unit": "linhas por 100 habitantes", "format": "float", "ramp": "teal",
         "higher_is": "neutral", "lo_floor": 0, "description": "Linhas de telefonia móvel, pré e pós-pagas.",
         "num": a["accesses"]["mobile"], "den": per100(a["base"]["mobile"])},
    ]
    for key, name, desc in [("cov4g", "Cobertura 4G", "Moradores dentro da área com 4G de alguma operadora."),
                            ("cov5g", "Cobertura 5G", "Moradores dentro da área com 5G de alguma operadora.")]:
        n, d = coverage(a["coverage"][key], pop)
        metrics.append({"id": key, "name": name, "unit": "dos moradores", "format": "pct", "ramp": "gold",
                        "higher_is": "good", "domain": [0, 1], "description": desc, "num": n, "den": d})
    build_series({"id": "net", "name": "Conexão", "vintage": a.get("vintage") or "Anatel", "sources": ["anatel"],
                  "years": YEARS, "rule": RULE, "question": "Como a conexão mudou desde {first}?",
                  "fixed_borders": True, "movers_min_pop": 10000}, metrics)


def check(web_dir):
    return check_series(web_dir, "net")
